#![no_std]
//! ============================================================
//! BANKERCHANGER — Market Contract (Security-Audited Implementation)
//! All fund-moving functions follow Checks-Effects-Interactions.
//! require_auth() is always the first call in fund-moving fns.
//! Emergency pause guard precedes every fund-moving operation.
//! ============================================================

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contractclient, contractimpl, token, Address, BytesN, Env, Map, Symbol, Vec,
};

use boxmeout_shared::{
    errors::ContractError,
    types::{
        AmmPool, AmmPosition, BetRecord, BetSide, ClaimReceipt, Config, FightDetails,
        LiquidityPosition, MarketConfig, MarketState, MarketStatus, OptionalMarketTier,
        OptionalOracleRole, OptionalOutcome, OracleReport, OracleRole, Outcome, VersionedOutcome,
        CURRENT_OUTCOME_VERSION, LEGACY_OUTCOME_VERSION,
    },
};

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const STATE: &str = "STATE";
const MARKET_TOKEN: &str = "MARKET_TOKEN";
/// Prefix for the per-bettor bets key: (BET_PREFIX, bettor) -> Vec<BetRecord>.
/// Keyed per-address so a lookup for one bettor doesn't deserialize every
/// other bettor's bets (see issue #255).
const BET_PREFIX: &str = "BET";
const BETTOR_LIST: &str = "BETTOR_LIST";
const FACTORY: &str = "FACTORY";
const CONFIG: &str = "CONFIG";
const TREASURY: &str = "TREASURY";
/// Reentrancy guard — set true while a claim/refund transfer is in flight
const CLAIMING: &str = "CLAIMING";
/// Emergency pause — when true all fund-moving operations are blocked
const PAUSED: &str = "PAUSED";
/// Pending oracle reports for 2-of-3 consensus
const PENDING_REPORTS: &str = "PENDING_REPORTS";
const REPORT_TTL: u64 = 172_800;
/// Ledger number at which the dispute cooldown window expires for a ResolutionPending market.
/// Written when consensus is reached and cleared when finalize_resolution completes.
const COOLDOWN_END_LEDGER: &str = "COOLDOWN_END";
/// Schema version for this market's persisted outcome.
const OUTCOME_VERSION: &str = "OUTCOME_VERSION";
/// Version-tagged outcome retained separately to preserve MarketState's storage ABI.
const VERSIONED_OUTCOME: &str = "VERSIONED_OUTCOME";
/// Default dispute cooldown in ledgers when market config does not specify one.
/// 720 ledgers × ~5 s/ledger ≈ 1 hour.
const DEFAULT_DISPUTE_COOLDOWN_LEDGERS: u32 = 720;
/// Total LP shares outstanding for this market pool
const LP_TOTAL_SHARES: &str = "LP_TOTAL_SHARES";
/// Prefix for per-provider LP position: (LP_PREFIX, provider) -> LiquidityPosition
const LP_PREFIX: &str       = "LP";
/// Accumulated fee-per-LP-share in micro-units (scaled by 1_000_000)
const LP_FEE_PER_SHARE: &str = "LP_FEE_PER_SHARE";
/// Optional AMM reserves and collateral, separate from legacy pari-mutuel pools.
const AMM_POOL: &str = "AMM_POOL";
/// Prefix for per-trader AMM outcome-share positions.
const AMM_POSITION_PREFIX: &str = "AMM_POSITION";
/// Aggregate net deposits refundable if the market is cancelled.
const AMM_REFUND_LIABILITY: &str = "AMM_REFUND_LIABILITY";
/// Trader positions which still require settlement.
const AMM_ACTIVE_TRADERS: &str = "AMM_ACTIVE_TRADERS";
/// Seed liquidity minimum — 1 XLM per pool side
const MIN_SEED_LIQUIDITY: i128 = 10_000_000;

// ─── Storage TTL Constants ────────────────────────────────────────────────────
/// Maximum TTL for market data expressed in ledgers.
/// At ~5 seconds per ledger: 30 days × 24 h × 60 min × 12 ledgers/min = 518_400 ledgers.
/// Using ledger counts (not seconds) as required by Soroban's extend_ttl API.
const MAX_TTL: u32 = 518_400;

/// Fallback maximum price impact (slippage) when no tier is set, in basis points.
/// Used in `emit_slippage_checked` for legacy / no-tier markets.
/// 3000 bps = 30 % — protects bettors from placing inadvertently large
/// orders into thin pools that would give them very poor execution.
const MAX_SLIPPAGE_BPS: i128 = 3_000;

// ─── Cross-contract client for oracle whitelist check ─────────────────────────
#[contractclient(name = "FactoryClient")]
pub trait FactoryInterface {
    /// Returns the factory's currently whitelisted oracle addresses.
    fn get_oracles(env: Env) -> Vec<Address>;

    /// Returns an oracle's registered raw Ed25519 public key, if whitelisted.
    fn get_oracle_key(env: Env, oracle: Address) -> Option<BytesN<32>>;

    /// Returns whether the factory is paused.
    fn is_paused(env: Env) -> bool;

    /// Returns the registered admin address of the factory.
    fn get_admin(env: Env) -> Address;
}

#[contract]
pub struct Market;

// ─── Internal helpers ─────────────────────────────────────────────────────────
impl Market {
    // Keep every pool in one token contract and one configured decimal scale.
    fn require_market_token(env: &Env, token: &Address) -> Result<(), ContractError> {
        let configured_token: Option<Address> =
            env.storage().persistent().get(&MARKET_TOKEN);
        match configured_token {
            Some(configured_token) if configured_token != *token => {
                Err(ContractError::MarketTokenMismatch)
            }
            Some(_) => Ok(()),
            None => {
                env.storage().persistent().set(&MARKET_TOKEN, token);
                Ok(())
            }
        }
    }

    /// Abort if the contract-level emergency pause is active.
    fn require_not_paused(env: &Env) -> Result<(), ContractError> {
        let paused: bool = env.storage().instance().get(&PAUSED).unwrap_or(false);
        if paused {
            return Err(ContractError::InvalidMarketStatus);
        }
        Ok(())
    }

    /// Abort if a claim/refund is already in progress (reentrancy guard).
    ///
    /// # Why this is necessary
    /// If the token contract is adversarial it could re-enter `claim_winnings`
    /// during the transfer callback. Without this guard a second call would
    /// pass all CHECKS (bets not yet marked claimed) and issue a double payout.
    /// The CLAIMING flag is set in EFFECTS (before any transfer) and cleared
    /// in CLEANUP (after all transfers), making re-entry impossible.
    fn require_not_claiming(env: &Env) -> Result<(), ContractError> {
        let claiming: bool = env.storage().instance().get(&CLAIMING).unwrap_or(false);
        if claiming {
            return Err(ContractError::ReentrancyGuard);
        }
        Ok(())
    }

    fn load_state(env: &Env) -> Result<MarketState, ContractError> {
        env.storage()
            .persistent()
            .get(&STATE)
            .ok_or(ContractError::MarketNotFound)
    }

    fn calculate_claim_amounts(
        bettor_stake: i128,
        winning_pool: i128,
        total_pool: i128,
        net_pool: i128,
        fee_bps: i128,
    ) -> Result<(i128, i128), ContractError> {
        if winning_pool == 0 {
            return Ok((0, 0));
        }
        let gross_payout = bettor_stake
            .checked_mul(total_pool)
            .and_then(|value| value.checked_div(winning_pool))
            .ok_or(ContractError::InsufficientAmount)?;
        let payout = bettor_stake
            .checked_mul(net_pool)
            .and_then(|value| value.checked_div(winning_pool))
            .ok_or(ContractError::InsufficientAmount)?;
        let fee = gross_payout
            .checked_mul(fee_bps)
            .and_then(|value| value.checked_div(10_000))
            .ok_or(ContractError::InsufficientAmount)?;
        Ok((payout, fee))
    }

    fn save_state(env: &Env, state: &MarketState) {
        env.storage().persistent().set(&STATE, state);
    }

    fn bet_key(env: &Env, bettor: &Address) -> (Symbol, Address) {
        (Symbol::new(env, BET_PREFIX), bettor.clone())
    }

    fn load_bets(env: &Env, bettor: &Address) -> Vec<BetRecord> {
        let key = Self::bet_key(env, bettor);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn save_bets(env: &Env, bettor: &Address, bets: &Vec<BetRecord>) {
        let key = Self::bet_key(env, bettor);
        env.storage().persistent().set(&key, bets);
        env.storage()
            .persistent()
            .extend_ttl(&key, MAX_TTL, MAX_TTL);
    }

    fn is_oracle_whitelisted(env: &Env, caller: &Address) -> Result<bool, ContractError> {
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        let client = FactoryClient::new(env, &factory);
        let oracles = client.get_oracles();
        Ok(oracles.contains(caller.clone()))
    }

    /// Returns the raw Ed25519 public key for `caller` if they are whitelisted, or None.
    fn get_oracle_raw_key(
        env: &Env,
        caller: &Address,
    ) -> Result<Option<BytesN<32>>, ContractError> {
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        let client = FactoryClient::new(env, &factory);
        Ok(client.get_oracle_key(caller))
    }

    /// Extend TTL on market data entries to prevent premature expiration.
    fn extend_market_ttl(env: &Env) {
        env.storage()
            .persistent()
            .extend_ttl(&STATE, MAX_TTL, MAX_TTL);
        env.storage()
            .persistent()
            .extend_ttl(&BETTOR_LIST, MAX_TTL, MAX_TTL);
        if env.storage().persistent().has(&MARKET_TOKEN) {
            env.storage()
                .persistent()
                .extend_ttl(&MARKET_TOKEN, MAX_TTL, MAX_TTL);
        }
        if env.storage().persistent().has(&OUTCOME_VERSION) {
            env.storage()
                .persistent()
                .extend_ttl(&OUTCOME_VERSION, MAX_TTL, MAX_TTL);
        }
        if env.storage().persistent().has(&VERSIONED_OUTCOME) {
            env.storage()
                .persistent()
                .extend_ttl(&VERSIONED_OUTCOME, MAX_TTL, MAX_TTL);
        }
        for key in [
            LP_TOTAL_SHARES,
            LP_FEE_PER_SHARE,
            AMM_REFUND_LIABILITY,
            AMM_ACTIVE_TRADERS,
        ] {
            if env.storage().persistent().has(&key) {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, MAX_TTL, MAX_TTL);
            }
        }
    }

    fn lp_key(env: &Env, provider: &Address) -> (Symbol, Address) {
        (Symbol::new(env, LP_PREFIX), provider.clone())
    }

    fn load_lp_position(env: &Env, provider: &Address) -> Option<LiquidityPosition> {
        let key = Self::lp_key(env, provider);
        env.storage().persistent().get(&key)
    }

    fn save_lp_position(env: &Env, provider: &Address, position: &LiquidityPosition) {
        let key = Self::lp_key(env, provider);
        env.storage().persistent().set(&key, position);
        env.storage().persistent().extend_ttl(&key, MAX_TTL, MAX_TTL);
    }

    fn remove_lp_position(env: &Env, provider: &Address) {
        let key = Self::lp_key(env, provider);
        env.storage().persistent().remove(&key);
    }

    fn load_amm_pool(env: &Env) -> Option<AmmPool> {
        env.storage().persistent().get(&AMM_POOL)
    }

    fn save_amm_pool(env: &Env, pool: &AmmPool) {
        env.storage().persistent().set(&AMM_POOL, pool);
        env.storage()
            .persistent()
            .extend_ttl(&AMM_POOL, MAX_TTL, MAX_TTL);
    }

    fn amm_position_key(env: &Env, trader: &Address) -> (Symbol, Address) {
        (Symbol::new(env, AMM_POSITION_PREFIX), trader.clone())
    }

    fn load_amm_position(env: &Env, trader: &Address) -> Option<AmmPosition> {
        env.storage()
            .persistent()
            .get(&Self::amm_position_key(env, trader))
    }

    fn save_amm_position(env: &Env, trader: &Address, position: &AmmPosition) {
        let key = Self::amm_position_key(env, trader);
        env.storage().persistent().set(&key, position);
        env.storage()
            .persistent()
            .extend_ttl(&key, MAX_TTL, MAX_TTL);
    }

    fn amm_side(side: &BetSide) -> u8 {
        match side {
            BetSide::FighterA => 0,
            BetSide::FighterB => 1,
            BetSide::Draw => 2,
        }
    }
}

#[contractimpl]
impl Market {
    // =========================================================================
    // INITIALIZE
    // =========================================================================
    /// Initializes this market immediately after deployment by the factory.
    ///
    /// # Arguments
    /// * `tier` - Optional AMM tier (8, 10, 12, or 14). Pass `0` for no tier.
    ///           Tier controls the minimum liquidity and slippage tolerance for
    ///           the AMM & Odds Calculation Pipeline (issues #473–#476).
    ///
    /// # Errors
    /// - `AlreadyInitialized`: Market has already been initialized
    ///
    /// # Security
    /// - Caller must be the factory (NotFactory guard).
    /// - AlreadyInitialized guard prevents re-initialization.
    pub fn initialize(
        env: Env,
        factory: Address,
        market_id: u64,
        fight: FightDetails,
        config: MarketConfig,
        treasury: Address,
        tier: u32,
    ) -> Result<(), ContractError> {
        // CHECKS
        factory.require_auth();
        if env.storage().persistent().has(&STATE) {
            return Err(ContractError::AlreadyInitialized);
        }
        if config.token_decimals > boxmeout_shared::math::MAX_TOKEN_DECIMALS {
            return Err(ContractError::InvalidTokenPrecision);
        }

        // Map the tier u32 to an OptionalMarketTier variant.
        let market_tier = match tier {
            8  => OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier8),
            10 => OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier10),
            12 => OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier12),
            14 => OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier14),
            _  => OptionalMarketTier::None,
        };

        // EFFECTS
        let state = MarketState {
            market_id,
            fight,
            config,
            status: MarketStatus::Open,
            outcome: OptionalOutcome::None,
            pool_a: 0,
            pool_b: 0,
            pool_draw: 0,
            total_pool: 0,
            resolved_at: 0,
            oracle_used: OptionalOracleRole::None,
            tier: market_tier,
        };
        env.storage().persistent().set(&STATE, &state);
        env.storage()
            .persistent()
            .set(&OUTCOME_VERSION, &CURRENT_OUTCOME_VERSION);
        env.storage().persistent().set(&FACTORY, &factory);
        env.storage().persistent().set(&TREASURY, &treasury);
        env.storage()
            .persistent()
            .set(&BETTOR_LIST, &Vec::<Address>::new(&env));
        env.storage().instance().set(&PAUSED, &false);
        env.storage().instance().set(&CLAIMING, &false);

        // Set TTL on market data entries
        Self::extend_market_ttl(&env);

        Ok(())
    }

    // =========================================================================
    // PLACE BET  — fund-moving
    // =========================================================================
    /// Places a bet on behalf of bettor.
    ///
    /// # Errors
    /// - `MarketNotOpen`: Market is not open or fight is in the past
    /// - `InvalidTimeRange`: Betting window has not opened or deadline is invalid
    /// - `BetTooLow`: Bet amount is below minimum
    /// - `BetTooLarge`: Bet amount exceeds maximum
    /// - `SlippageExceeded`: Computed AMM shares are below `min_shares_out`
    ///
    /// # Security (CEI enforced)
    /// 1. CHECKS: require_auth, pause guard, status, timing, amount bounds
    /// 2. EFFECTS: state + bets updated in storage
    /// 3. INTERACTIONS: token transfer last
    pub fn place_bet(
        env: Env,
        bettor: Address,
        side: BetSide,
        amount: i128,
        token: Address,
        min_shares_out: i128,
    ) -> Result<BetRecord, ContractError> {
        // ── CHECKS ────────────────────────────────────────────────────────────
        bettor.require_auth(); // auth first
        Self::require_not_paused(&env)?; // pause guard

        let state = Self::load_state(&env)?;

        if state.status != MarketStatus::Open {
            return Err(ContractError::MarketNotOpen);
        }

        let lock_threshold = state
            .fight
            .scheduled_at
            .saturating_sub(state.config.lock_before_secs);
        if env.ledger().timestamp() >= lock_threshold {
            return Err(ContractError::BettingClosed);
        }

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        let normalized_amount = boxmeout_shared::math::normalize_token_amount(
            amount,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        if normalized_amount < state.config.min_bet_amount {
            return Err(ContractError::BelowMinimum);
        }
        if normalized_amount > state.config.max_bet {
            return Err(ContractError::BetTooLarge);
        }

        // Slippage / price-impact sanity check.
        // Compute the AMM price impact of this bet. If the pool is so thin that
        // the bet would move the price by more than the tier-specific limit, reject
        // it to protect bettors from catastrophically bad execution.
        // The check only applies when all pools are initialised (> 0); when a pool
        // is still zero the AMM is not yet active and we skip the check.
        //
        // Tier-specific thresholds (AMM & Odds Calculation Pipeline, issues #473–#476):
        //   Tier 8  → 3 000 bps max slippage (30 %)
        //   Tier 10 → 2 500 bps max slippage (25 %)
        //   Tier 12 → 2 000 bps max slippage (20 %)
        //   Tier 14 → 1 500 bps max slippage (15 %)
        //   No tier → 3 000 bps (legacy global cap)

        // Derive the tier byte for AMM calculations.
        let tier_byte: u8 = match &state.tier {
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier8)  => 8,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier10) => 10,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier12) => 12,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier14) => 14,
            OptionalMarketTier::None => 0,
        };

        // Determine whether this is the first bet that brings all pools > 0.
        let pools_were_zero = state.pool_a == 0 || state.pool_b == 0 || state.pool_draw == 0;

        if state.pool_a > 0 && state.pool_b > 0 && state.pool_draw > 0 {
            let side_byte: u8 = match side {
                BetSide::FighterA => 0,
                BetSide::FighterB => 1,
                BetSide::Draw => 2,
            };
            if let Some((shares_out, impact_bps)) = boxmeout_shared::amm::compute_odds(
                state.pool_a,
                state.pool_b,
                state.pool_draw,
                normalized_amount,
                side_byte,
            ) {
                // Tier-aware slippage check.
                if !boxmeout_shared::amm::check_tier_slippage(tier_byte, state.total_pool, impact_bps) {
                    return Err(ContractError::SlippageExceeded);
                }
                if shares_out < min_shares_out {
                    return Err(ContractError::SlippageExceeded);
                }
                // Emit real-time odds update for frontend
                // Note: state.pool_* values are the CURRENT (pre-bet) pool sizes
                boxmeout_shared::emit_odds_computed(
                    &env,
                    state.market_id,
                    state.pool_a,
                    state.pool_b,
                    state.pool_draw,
                    shares_out,
                    impact_bps,
                );
            }
        }

        // ── EFFECTS ───────────────────────────────────────────────────────────
        Self::require_market_token(&env, &token)?;
        let mut new_state = state.clone();
        match side {
            BetSide::FighterA => new_state.pool_a = new_state.pool_a
                .checked_add(normalized_amount)
                .ok_or(ContractError::InsufficientAmount)?,
            BetSide::FighterB => new_state.pool_b = new_state.pool_b
                .checked_add(normalized_amount)
                .ok_or(ContractError::InsufficientAmount)?,
            BetSide::Draw => new_state.pool_draw = new_state.pool_draw
                .checked_add(normalized_amount)
                .ok_or(ContractError::InsufficientAmount)?,
        }
        new_state.total_pool = new_state.total_pool
            .checked_add(normalized_amount)
            .ok_or(ContractError::InsufficientAmount)?;
        Self::save_state(&env, &new_state);

        let bet = BetRecord {
            bettor: bettor.clone(),
            market_id: new_state.market_id,
            side: side.clone(),
            amount: normalized_amount,
            placed_at: env.ledger().timestamp(),
            claimed: false,
        };

        let mut bets = Self::load_bets(&env, &bettor);
        if !bets.is_empty() {
            return Err(ContractError::AlreadyBet);
        }
        let is_first_bet = true;
        bets.push_back(bet.clone());
        Self::save_bets(&env, &bettor, &bets);

        if is_first_bet {
            let mut bettor_list: Vec<Address> = env
                .storage()
                .persistent()
                .get(&BETTOR_LIST)
                .unwrap_or_else(|| Vec::new(&env));
            bettor_list.push_back(bettor.clone());
            env.storage().persistent().set(&BETTOR_LIST, &bettor_list);
        }

        // Extend TTL on each bet to keep market active
        Self::extend_market_ttl(&env);

        // ── INTERACTIONS ──────────────────────────────────────────────────────
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        boxmeout_shared::emit_bet_placed(&env, new_state.market_id, bet.clone());

        // ── AMM PIPELINE EVENTS (issues #473–#476) ────────────────────────────
        // Emit pool_initialized when all three pools are now non-zero for the
        // first time (i.e., this bet completed the initial liquidity bootstrap).
        if pools_were_zero
            && new_state.pool_a > 0
            && new_state.pool_b > 0
            && new_state.pool_draw > 0
        {
            boxmeout_shared::emit_pool_initialized(
                &env,
                new_state.market_id,
                tier_byte as u32,
                new_state.pool_a,
                new_state.pool_b,
                new_state.pool_draw,
            );
        }

        // Emit odds_updated after every bet so the frontend can refresh live odds.
        // Re-compute impact_bps using the post-bet pools so the value matches the
        // actual price movement caused by this bet.
        let side_byte: u8 = match side {
            BetSide::FighterA => 0,
            BetSide::FighterB => 1,
            BetSide::Draw     => 2,
        };
        let impact_bps_for_event: i128 =
            if new_state.pool_a > 0 && new_state.pool_b > 0 && new_state.pool_draw > 0 {
                // Use pre-bet pools to compute impact of this individual bet.
                boxmeout_shared::amm::compute_odds(
                    state.pool_a.max(1),
                    state.pool_b.max(1),
                    state.pool_draw.max(1),
                    normalized_amount,
                    side_byte,
                )
                .map(|(_, imp)| imp)
                .unwrap_or(0)
            } else {
                0
            };
        boxmeout_shared::emit_odds_updated(
            &env,
            new_state.market_id,
            tier_byte as u32,
            new_state.pool_a,
            new_state.pool_b,
            new_state.pool_draw,
            impact_bps_for_event,
        );

        // Emit slippage_checked when pools were active and the slippage check ran.
        if !pools_were_zero {
            let max_bps = boxmeout_shared::amm::tier_params(tier_byte)
                .map(|p| p.max_slippage_bps)
                .unwrap_or(MAX_SLIPPAGE_BPS);
            boxmeout_shared::emit_slippage_checked(
                &env,
                new_state.market_id,
                tier_byte as u32,
                // shares_out: re-derive from pre-bet compute_odds result (0 if unavailable)
                boxmeout_shared::amm::compute_odds(
                    state.pool_a.max(1),
                    state.pool_b.max(1),
                    state.pool_draw.max(1),
                    normalized_amount,
                    side_byte,
                )
                .map(|(s, _)| s)
                .unwrap_or(0),
                impact_bps_for_event,
                max_bps,
            );
        }

        Ok(bet)
    }

    // =========================================================================
    // ADD LIQUIDITY  — fund-moving
    // =========================================================================
    /// Seeds or adds liquidity to the three-way AMM pool.
    ///
    /// The first deposit seeds the three outcome reserves and establishes initial
    /// prices. Later deposits must be proportional to current reserve balances.
    /// LP shares represent a proportional claim on AMM collateral.
    ///
    /// # Errors
    /// - `MarketNotOpen`: Market is not accepting liquidity
    /// - `BelowMinimum`: Seed liquidity amounts are below minimum
    /// - `SlippageExceeded`: Shares minted are below `min_lp_shares_out`
    ///
    /// # Security (CEI)
    /// 1. CHECKS: require_auth, pause guard, status, minimums, slippage
    /// 2. EFFECTS: update pool sizes, mint LP shares
    /// 3. INTERACTIONS: token transfers last
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        amount_a: i128,
        amount_b: i128,
        amount_draw: i128,
        token: Address,
        min_lp_shares_out: i128,
    ) -> Result<LiquidityPosition, ContractError> {
        provider.require_auth();
        Self::require_not_paused(&env)?;
        let state = Self::load_state(&env)?;
        if state.status != MarketStatus::Open {
            return Err(ContractError::MarketNotOpen);
        }
        if amount_a <= 0 || amount_b <= 0 || amount_draw <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if min_lp_shares_out < 0 {
            return Err(ContractError::InvalidAmount);
        }

        let normalized_a = boxmeout_shared::math::normalize_token_amount(
            amount_a,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let normalized_b = boxmeout_shared::math::normalize_token_amount(
            amount_b,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let normalized_draw = boxmeout_shared::math::normalize_token_amount(
            amount_draw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let total_in_raw = amount_a
            .checked_add(amount_b)
            .and_then(|v| v.checked_add(amount_draw))
            .ok_or(ContractError::InsufficientAmount)?;

        if normalized_a < MIN_SEED_LIQUIDITY
            || normalized_b < MIN_SEED_LIQUIDITY
            || normalized_draw < MIN_SEED_LIQUIDITY
        {
            return Err(ContractError::BelowMinimum);
        }

        let total_in = normalized_a
            .checked_add(normalized_b)
            .and_then(|v| v.checked_add(normalized_draw))
            .ok_or(ContractError::InsufficientAmount)?;

        let mut pool = Self::load_amm_pool(&env).unwrap_or(AmmPool {
            reserve_a: 0,
            reserve_b: 0,
            reserve_draw: 0,
            collateral: 0,
            outstanding_shares: 0,
            outstanding_a: 0,
            outstanding_b: 0,
            outstanding_draw: 0,
        });
        let total_shares: i128 = env
            .storage()
            .persistent()
            .get(&LP_TOTAL_SHARES)
            .unwrap_or(0);
        let fee_per_share: i128 = env
            .storage()
            .persistent()
            .get(&LP_FEE_PER_SHARE)
            .unwrap_or(0);

        if total_shares > 0 {
            let a_over_b = normalized_a
                .checked_mul(pool.reserve_b)
                .ok_or(ContractError::InsufficientAmount)?;
            let b_over_a = normalized_b
                .checked_mul(pool.reserve_a)
                .ok_or(ContractError::InsufficientAmount)?;
            let a_over_draw = normalized_a
                .checked_mul(pool.reserve_draw)
                .ok_or(ContractError::InsufficientAmount)?;
            let draw_over_a = normalized_draw
                .checked_mul(pool.reserve_a)
                .ok_or(ContractError::InsufficientAmount)?;
            if a_over_b != b_over_a || a_over_draw != draw_over_a {
                return Err(ContractError::InvalidMarketParameters);
            }
        }

        let lp_shares = if total_shares == 0 || pool.collateral == 0 {
            total_in
        } else {
            total_in
                .checked_mul(total_shares)
                .and_then(|v| v.checked_div(pool.collateral))
                .ok_or(ContractError::InsufficientAmount)?
        };

        if lp_shares <= 0 || lp_shares < min_lp_shares_out {
            return Err(ContractError::SlippageExceeded);
        }

        Self::require_market_token(&env, &token)?;
        pool.reserve_a = pool
            .reserve_a
            .checked_add(normalized_a)
            .ok_or(ContractError::InsufficientAmount)?;
        pool.reserve_b = pool
            .reserve_b
            .checked_add(normalized_b)
            .ok_or(ContractError::InsufficientAmount)?;
        pool.reserve_draw = pool
            .reserve_draw
            .checked_add(normalized_draw)
            .ok_or(ContractError::InsufficientAmount)?;
        pool.collateral = pool
            .collateral
            .checked_add(total_in)
            .ok_or(ContractError::InsufficientAmount)?;
        Self::save_amm_pool(&env, &pool);

        let new_total_shares = total_shares
            .checked_add(lp_shares)
            .ok_or(ContractError::InsufficientAmount)?;
        env.storage().persistent().set(&LP_TOTAL_SHARES, &new_total_shares);

        let mut position = Self::load_lp_position(&env, &provider).unwrap_or(LiquidityPosition {
            provider: provider.clone(),
            market_id: state.market_id,
            fee_debt: fee_per_share,
            entered_at: env.ledger().timestamp(),
            lp_shares: 0,
        });
        position.lp_shares = position
            .lp_shares
            .checked_add(lp_shares)
            .ok_or(ContractError::InsufficientAmount)?;
        position.fee_debt = fee_per_share;
        Self::save_lp_position(&env, &provider, &position);
        Self::extend_market_ttl(&env);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&provider, &env.current_contract_address(), &total_in_raw);

        boxmeout_shared::emit_liquidity_added(
            &env,
            state.market_id,
            provider,
            normalized_a,
            normalized_b,
            normalized_draw,
            lp_shares,
        );
        if total_shares == 0 {
            let tier_byte = match &state.tier {
                OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier8) => 8,
                OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier10) => 10,
                OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier12) => 12,
                OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier14) => 14,
                OptionalMarketTier::None => 0,
            };
            boxmeout_shared::emit_pool_initialized(
                &env,
                state.market_id,
                tier_byte as u32,
                pool.reserve_a,
                pool.reserve_b,
                pool.reserve_draw,
            );
        }

        Ok(position)
    }

    // =========================================================================
    // REMOVE LIQUIDITY  — fund-moving
    // =========================================================================
    /// Redeems LP shares for proportional AMM collateral.
    ///
    /// # Errors
    /// - `MarketNotOpen`: Market is not open (liquidity withdrawal only during Open phase)
    /// - `NoBetsFound`: Provider has no LP position
    /// - `BelowMinimum`: lp_shares_to_burn is zero or negative
    /// - `InsufficientBalance`: Provider doesn't have enough LP shares
    ///
    /// Returns the paid amount in the shared seven-decimal calculation scale.
    ///
    /// # Security (CEI)
    /// 1. CHECKS: require_auth, pause guard, status, position exists, shares
    /// 2. EFFECTS: burn shares, reduce pools
    /// 3. INTERACTIONS: token transfer last
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        lp_shares_to_burn: i128,
        token: Address,
    ) -> Result<i128, ContractError> {
        provider.require_auth();
        Self::require_not_paused(&env)?;

        let state = Self::load_state(&env)?;
        let mut pool = Self::load_amm_pool(&env).ok_or(ContractError::InvalidMarketStatus)?;
        let active_traders: u32 = env
            .storage()
            .persistent()
            .get(&AMM_ACTIVE_TRADERS)
            .unwrap_or(0);
        let terminal_withdrawal_ready = match &state.status {
            MarketStatus::Resolved => match &state.outcome {
                OptionalOutcome::Some(Outcome::NoContest) => active_traders == 0,
                OptionalOutcome::Some(_) => true,
                OptionalOutcome::None => false,
            },
            MarketStatus::Cancelled => active_traders == 0,
            _ => false,
        };
        if state.status != MarketStatus::Open && !terminal_withdrawal_ready {
            return Err(ContractError::MarketNotOpen);
        }
        if lp_shares_to_burn <= 0 {
            return Err(ContractError::BelowMinimum);
        }
        let mut position = Self::load_lp_position(&env, &provider)
            .ok_or(ContractError::NoBetsFound)?;
        if lp_shares_to_burn > position.lp_shares {
            return Err(ContractError::InsufficientBalance);
        }

        let total_shares: i128 = env.storage().persistent()
            .get(&LP_TOTAL_SHARES)
            .unwrap_or(0);
        if total_shares <= 0 || lp_shares_to_burn > total_shares {
            return Err(ContractError::InsufficientBalance);
        }
        let withdraw = if lp_shares_to_burn == total_shares {
            pool.collateral
        } else {
            pool.collateral
                .checked_mul(lp_shares_to_burn)
                .and_then(|value| value.checked_div(total_shares))
                .ok_or(ContractError::InsufficientAmount)?
        };
        let withdraw_raw = boxmeout_shared::math::denormalize_token_amount_floor(
            withdraw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let withdraw_paid = boxmeout_shared::math::normalize_token_amount(
            withdraw_raw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let fee_per_share: i128 = env.storage().persistent()
            .get(&LP_FEE_PER_SHARE)
            .unwrap_or(0);
        let fees_claimed = boxmeout_shared::amm::calc_claimable_lp_fees(
            fee_per_share,
            position.fee_debt,
            lp_shares_to_burn,
        );
        let fees_claimed_raw = boxmeout_shared::math::denormalize_token_amount_floor(
            fees_claimed,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let fees_claimed_paid = boxmeout_shared::math::normalize_token_amount(
            fees_claimed_raw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let total_withdrawal = withdraw_paid
            .checked_add(fees_claimed_paid)
            .ok_or(ContractError::InsufficientAmount)?;
        let remaining_collateral = pool
            .collateral
            .checked_sub(total_withdrawal)
            .ok_or(ContractError::InsufficientBalance)?;
        let refund_liability: i128 = env
            .storage()
            .persistent()
            .get(&AMM_REFUND_LIABILITY)
            .unwrap_or(0);
        let required_collateral = match &state.status {
            MarketStatus::Open => pool.outstanding_shares.max(refund_liability),
            MarketStatus::Cancelled => refund_liability,
            MarketStatus::Resolved => match &state.outcome {
                OptionalOutcome::Some(Outcome::FighterA) => pool.outstanding_a,
                OptionalOutcome::Some(Outcome::FighterB) => pool.outstanding_b,
                OptionalOutcome::Some(Outcome::Draw) => pool.outstanding_draw,
                OptionalOutcome::Some(Outcome::NoContest) => refund_liability,
                OptionalOutcome::None => return Err(ContractError::InvalidOutcome),
            },
            _ => return Err(ContractError::MarketNotOpen),
        };
        if remaining_collateral < required_collateral {
            return Err(ContractError::InsufficientBalance);
        }
        let withdraw_a = pool
            .reserve_a
            .checked_mul(lp_shares_to_burn)
            .and_then(|value| value.checked_div(total_shares))
            .ok_or(ContractError::InsufficientAmount)?;
        let withdraw_b = pool
            .reserve_b
            .checked_mul(lp_shares_to_burn)
            .and_then(|value| value.checked_div(total_shares))
            .ok_or(ContractError::InsufficientAmount)?;
        let withdraw_draw = pool
            .reserve_draw
            .checked_mul(lp_shares_to_burn)
            .and_then(|value| value.checked_div(total_shares))
            .ok_or(ContractError::InsufficientAmount)?;
        Self::require_market_token(&env, &token)?;
        pool.collateral = remaining_collateral;
        pool.reserve_a = pool.reserve_a.checked_sub(withdraw_a)
            .ok_or(ContractError::InsufficientBalance)?;
        pool.reserve_b = pool.reserve_b.checked_sub(withdraw_b)
            .ok_or(ContractError::InsufficientBalance)?;
        pool.reserve_draw = pool.reserve_draw.checked_sub(withdraw_draw)
            .ok_or(ContractError::InsufficientBalance)?;
        Self::save_amm_pool(&env, &pool);

        let new_total_shares = total_shares
            .checked_sub(lp_shares_to_burn)
            .ok_or(ContractError::InsufficientBalance)?;
        env.storage().persistent().set(&LP_TOTAL_SHARES, &new_total_shares);

        let remaining_shares = position.lp_shares - lp_shares_to_burn;
        if remaining_shares == 0 {
            Self::remove_lp_position(&env, &provider);
        } else {
            position.lp_shares = remaining_shares;
            position.fee_debt = fee_per_share;
            Self::save_lp_position(&env, &provider, &position);
        }
        Self::extend_market_ttl(&env);

        let total_out_raw = withdraw_raw
            .checked_add(fees_claimed_raw)
            .ok_or(ContractError::InsufficientAmount)?;
        let payout = withdraw_paid
            .checked_add(fees_claimed_paid)
            .ok_or(ContractError::InsufficientAmount)?;
        if total_out_raw > 0 {
            let token_client = token::Client::new(&env, &token);
            token_client.transfer(&env.current_contract_address(), &provider, &total_out_raw);
        }

        boxmeout_shared::emit_liquidity_removed(
            &env,
            state.market_id,
            provider,
            lp_shares_to_burn,
            withdraw_a,
            withdraw_b,
            withdraw_draw,
            fees_claimed_paid,
        );

        Ok(payout)
    }

    /// Buys outcome shares from the optional AMM using collateral.
    pub fn buy_shares(
        env: Env,
        trader: Address,
        side: BetSide,
        amount: i128,
        token: Address,
        min_shares_out: i128,
    ) -> Result<i128, ContractError> {
        trader.require_auth();
        Self::require_not_paused(&env)?;
        if min_shares_out < 0 {
            return Err(ContractError::InvalidAmount);
        }
        let state = Self::load_state(&env)?;
        if state.status != MarketStatus::Open {
            return Err(ContractError::MarketNotOpen);
        }
        let lock_threshold = state
            .fight
            .scheduled_at
            .saturating_sub(state.config.lock_before_secs);
        if env.ledger().timestamp() >= lock_threshold {
            return Err(ContractError::BettingClosed);
        }
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        let amount_normalized =
            boxmeout_shared::math::normalize_token_amount(amount, state.config.token_decimals)
                .ok_or(ContractError::InvalidTokenPrecision)?;
        if amount_normalized < state.config.min_bet_amount {
            return Err(ContractError::BelowMinimum);
        }
        if amount_normalized > state.config.max_bet {
            return Err(ContractError::BetTooLarge);
        }


        let (shares_out, impact_bps) = boxmeout_shared::amm::compute_odds(
            pool.reserve_a,
            pool.reserve_b,
            pool.reserve_draw,
            amount_normalized,
            Self::amm_side(&side),
        )
        .ok_or(ContractError::InvalidAmount)?;
        if shares_out < min_shares_out {
            return Err(ContractError::SlippageExceeded);
        }
        let tier_byte = match &state.tier {
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier8) => 8,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier10) => 10,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier12) => 12,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier14) => 14,
            OptionalMarketTier::None => 0,
        };
        if !boxmeout_shared::amm::check_tier_slippage(
            tier_byte,
            pool.collateral,
            impact_bps,
        ) {
            return Err(ContractError::SlippageExceeded);
        }

        let collateral_after = pool
            .collateral
            .checked_add(amount_normalized)
            .ok_or(ContractError::InsufficientAmount)?;
        let outstanding_after = pool
            .outstanding_shares
            .checked_add(shares_out)
            .ok_or(ContractError::InsufficientAmount)?;
        match side {
            BetSide::FighterA => {
                pool.reserve_a = pool.reserve_a.checked_sub(shares_out)
                    .ok_or(ContractError::InsufficientBalance)?;
                pool.reserve_draw = pool.reserve_draw.checked_add(amount_normalized)
                    .ok_or(ContractError::InsufficientAmount)?;
                pool.outstanding_a = pool.outstanding_a.checked_add(shares_out)
                    .ok_or(ContractError::InsufficientAmount)?;
            }
            BetSide::FighterB => {
                pool.reserve_b = pool.reserve_b.checked_sub(shares_out)
                    .ok_or(ContractError::InsufficientBalance)?;
                pool.reserve_draw = pool.reserve_draw.checked_add(amount_normalized)
                    .ok_or(ContractError::InsufficientAmount)?;
                pool.outstanding_b = pool.outstanding_b.checked_add(shares_out)
                    .ok_or(ContractError::InsufficientAmount)?;
            }
            BetSide::Draw => {
                pool.reserve_draw = pool.reserve_draw.checked_sub(shares_out)
                    .ok_or(ContractError::InsufficientBalance)?;
                pool.reserve_a = pool.reserve_a.checked_add(amount_normalized)
                    .ok_or(ContractError::InsufficientAmount)?;
                pool.outstanding_draw = pool.outstanding_draw.checked_add(shares_out)
                    .ok_or(ContractError::InsufficientAmount)?;
            }
        }
        pool.collateral = collateral_after;
        pool.outstanding_shares = outstanding_after;

        let existing_position = Self::load_amm_position(&env, &trader);
        let mut position = existing_position.clone().unwrap_or(AmmPosition {
            market_id: state.market_id,
            shares_a: 0,
            shares_b: 0,
            shares_draw: 0,
            net_collateral: 0,
            claimed: false,
        });
        if position.market_id != state.market_id || position.claimed {
            return Err(ContractError::InvalidMarketStatus);
        }
        match side {
            BetSide::FighterA => {
                position.shares_a = position.shares_a.checked_add(shares_out)
                    .ok_or(ContractError::InsufficientAmount)?;
            }
            BetSide::FighterB => {
                position.shares_b = position.shares_b.checked_add(shares_out)
                    .ok_or(ContractError::InsufficientAmount)?;
            }
            BetSide::Draw => {
                position.shares_draw = position.shares_draw.checked_add(shares_out)
                    .ok_or(ContractError::InsufficientAmount)?;
            }
        }
        let old_refund = position.net_collateral.max(0);
        position.net_collateral = position.net_collateral.checked_add(amount_normalized)
            .ok_or(ContractError::InsufficientAmount)?;
        let new_refund = position.net_collateral.max(0);
        let mut refund_liability: i128 = env
            .storage()
            .persistent()
            .get(&AMM_REFUND_LIABILITY)
            .unwrap_or(0);
        refund_liability = refund_liability
            .checked_sub(old_refund)
            .and_then(|value| value.checked_add(new_refund))
            .ok_or(ContractError::InsufficientAmount)?;
        if collateral_after < outstanding_after.max(refund_liability) {
            return Err(ContractError::InsufficientBalance);
        }
        if existing_position.is_none() {
            let active_traders: u32 = env
                .storage()
                .persistent()
                .get(&AMM_ACTIVE_TRADERS)
                .unwrap_or(0);
            env.storage().persistent().set(
                &AMM_ACTIVE_TRADERS,
                &active_traders
                    .checked_add(1)
                    .ok_or(ContractError::InsufficientAmount)?,
            );
        }

        Self::require_market_token(&env, &token)?;
        env.storage()
            .persistent()
            .set(&AMM_REFUND_LIABILITY, &refund_liability);
        Self::save_amm_pool(&env, &pool);
        Self::save_amm_position(&env, &trader, &position);
        Self::extend_market_ttl(&env);
        token::Client::new(&env, &token).transfer(
            &trader,
            &env.current_contract_address(),
            &amount,
        );
        env.events().publish(
            (Symbol::new(&env, "amm_shares_bought"), state.market_id),
            (trader, side, amount_normalized, shares_out, impact_bps),
        );
        Ok(shares_out)
    }

    /// Sells outcome shares back to the optional AMM for collateral.
    pub fn sell_shares(
        env: Env,
        trader: Address,
        side: BetSide,
        shares_in: i128,
        token: Address,
        min_amount_out: i128,
    ) -> Result<i128, ContractError> {
        trader.require_auth();
        Self::require_not_paused(&env)?;
        let state = Self::load_state(&env)?;
        if state.status != MarketStatus::Open {
            return Err(ContractError::MarketNotOpen);
        }
        let lock_threshold = state
            .fight
            .scheduled_at
            .saturating_sub(state.config.lock_before_secs);
        if env.ledger().timestamp() >= lock_threshold {
            return Err(ContractError::BettingClosed);
        }
        if shares_in <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if min_amount_out < 0 {
            return Err(ContractError::InvalidAmount);
        }
        let shares_normalized = shares_in;
        let min_out_normalized = boxmeout_shared::math::normalize_token_amount(
            min_amount_out,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let mut pool = Self::load_amm_pool(&env).ok_or(ContractError::InvalidMarketStatus)?;
        let (quoted_amount_out, impact_bps) = boxmeout_shared::amm::compute_sell_quote(
            pool.reserve_a,
            pool.reserve_b,
            pool.reserve_draw,
            shares_normalized,
            Self::amm_side(&side),
        )
        .ok_or(ContractError::InvalidAmount)?;
        let amount_out_raw = boxmeout_shared::math::denormalize_token_amount_floor(
            quoted_amount_out,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let amount_out = boxmeout_shared::math::normalize_token_amount(
            amount_out_raw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        if amount_out < min_out_normalized {
            return Err(ContractError::SlippageExceeded);
        }
        let tier_byte = match &state.tier {
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier8) => 8,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier10) => 10,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier12) => 12,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier14) => 14,
            OptionalMarketTier::None => 0,
        };
        if !boxmeout_shared::amm::check_tier_slippage(
            tier_byte,
            pool.collateral,
            impact_bps,
        ) {
            return Err(ContractError::SlippageExceeded);
        }

        let mut position =
            Self::load_amm_position(&env, &trader).ok_or(ContractError::InsufficientBalance)?;
        if position.market_id != state.market_id || position.claimed {
            return Err(ContractError::InvalidMarketStatus);
        }
        match side {
            BetSide::FighterA if shares_normalized <= position.shares_a => {
                position.shares_a -= shares_normalized;
            }
            BetSide::FighterB if shares_normalized <= position.shares_b => {
                position.shares_b -= shares_normalized;
            }
            BetSide::Draw if shares_normalized <= position.shares_draw => {
                position.shares_draw -= shares_normalized;
            }
            _ => return Err(ContractError::InsufficientBalance),
        }
        let collateral_after = pool
            .collateral
            .checked_sub(amount_out)
            .ok_or(ContractError::InsufficientBalance)?;
        let outstanding_after = pool
            .outstanding_shares
            .checked_sub(shares_normalized)
            .ok_or(ContractError::InsufficientBalance)?;
        let old_refund = position.net_collateral.max(0);
        position.net_collateral = position.net_collateral.checked_sub(amount_out)
            .ok_or(ContractError::InsufficientAmount)?;
        let new_refund = position.net_collateral.max(0);
        let mut refund_liability: i128 = env
            .storage()
            .persistent()
            .get(&AMM_REFUND_LIABILITY)
            .unwrap_or(0);
        refund_liability = refund_liability
            .checked_sub(old_refund)
            .and_then(|value| value.checked_add(new_refund))
            .ok_or(ContractError::InsufficientAmount)?;
        if collateral_after < outstanding_after.max(refund_liability) {
            return Err(ContractError::InsufficientBalance);
        }
        match side {
            BetSide::FighterA => {
                pool.reserve_a = pool.reserve_a.checked_add(shares_normalized)
                    .ok_or(ContractError::InsufficientAmount)?;
                pool.reserve_draw = pool.reserve_draw.checked_sub(amount_out)
                    .ok_or(ContractError::InsufficientBalance)?;
                pool.outstanding_a = pool.outstanding_a.checked_sub(shares_normalized)
                    .ok_or(ContractError::InsufficientBalance)?;
            }
            BetSide::FighterB => {
                pool.reserve_b = pool.reserve_b.checked_add(shares_normalized)
                    .ok_or(ContractError::InsufficientAmount)?;
                pool.reserve_draw = pool.reserve_draw.checked_sub(amount_out)
                    .ok_or(ContractError::InsufficientBalance)?;
                pool.outstanding_b = pool.outstanding_b.checked_sub(shares_normalized)
                    .ok_or(ContractError::InsufficientBalance)?;
            }
            BetSide::Draw => {
                pool.reserve_draw = pool.reserve_draw.checked_add(shares_normalized)
                    .ok_or(ContractError::InsufficientAmount)?;
                pool.reserve_a = pool.reserve_a.checked_sub(amount_out)
                    .ok_or(ContractError::InsufficientBalance)?;
                pool.outstanding_draw = pool.outstanding_draw.checked_sub(shares_normalized)
                    .ok_or(ContractError::InsufficientBalance)?;
            }
        }
        pool.collateral = collateral_after;
        pool.outstanding_shares = outstanding_after;

        Self::require_market_token(&env, &token)?;
        env.storage()
            .persistent()
            .set(&AMM_REFUND_LIABILITY, &refund_liability);
        Self::save_amm_pool(&env, &pool);
        Self::save_amm_position(&env, &trader, &position);
        Self::extend_market_ttl(&env);
        if amount_out_raw > 0 {
            token::Client::new(&env, &token).transfer(
                &env.current_contract_address(),
                &trader,
                &amount_out_raw,
            );
        }
        env.events().publish(
            (Symbol::new(&env, "amm_shares_sold"), state.market_id),
            (trader, side, shares_normalized, amount_out),
        );
        Ok(amount_out)
    }

    /// Redeems an AMM position after resolution, or refunds its net spend if cancelled.
    pub fn claim_amm_shares(
        env: Env,
        trader: Address,
        token: Address,
    ) -> Result<i128, ContractError> {
        trader.require_auth();
        Self::require_not_paused(&env)?;
        Self::require_not_claiming(&env)?;
        let state = Self::load_state(&env)?;
        let mut position =
            Self::load_amm_position(&env, &trader).ok_or(ContractError::NoBetsFound)?;
        if position.market_id != state.market_id {
            return Err(ContractError::NoBetsFound);
        }
        if position.claimed {
            return Err(ContractError::AlreadyClaimed);
        }
        let mut pool = Self::load_amm_pool(&env).ok_or(ContractError::InvalidMarketStatus)?;
        let shares_held = position
            .shares_a
            .checked_add(position.shares_b)
            .and_then(|value| value.checked_add(position.shares_draw))
            .ok_or(ContractError::InsufficientAmount)?;
        let (gross_payout, fee) = match &state.status {
            MarketStatus::Resolved => {
                let gross_payout = match &state.outcome {
                    OptionalOutcome::Some(Outcome::FighterA) => position.shares_a,
                    OptionalOutcome::Some(Outcome::FighterB) => position.shares_b,
                    OptionalOutcome::Some(Outcome::Draw) => position.shares_draw,
                    OptionalOutcome::Some(Outcome::NoContest) => position.net_collateral.max(0),
                    OptionalOutcome::None => return Err(ContractError::InvalidOutcome),
                };
                let fee = if matches!(
                    &state.outcome,
                    OptionalOutcome::Some(Outcome::NoContest)
                ) {
                    0
                } else {
                    gross_payout
                        .checked_mul(state.config.fee_bps as i128)
                        .and_then(|value| value.checked_div(10_000))
                        .ok_or(ContractError::InsufficientAmount)?
                };
                (gross_payout, fee)
            }
            MarketStatus::Cancelled => (position.net_collateral.max(0), 0),
            _ => return Err(ContractError::MarketNotResolved),
        };
        if shares_held > pool.outstanding_shares || gross_payout > pool.collateral {
            return Err(ContractError::InsufficientBalance);
        }
        let mut refund_liability: i128 = env
            .storage()
            .persistent()
            .get(&AMM_REFUND_LIABILITY)
            .unwrap_or(0);
        let user_refund = position.net_collateral.max(0);
        refund_liability = refund_liability
            .checked_sub(user_refund)
            .ok_or(ContractError::InsufficientBalance)?;
        if matches!(&state.status, MarketStatus::Cancelled) && gross_payout > user_refund {
            return Err(ContractError::InsufficientBalance);
        }
        let active_traders: u32 = env
            .storage()
            .persistent()
            .get(&AMM_ACTIVE_TRADERS)
            .unwrap_or(0);
        let active_traders = active_traders
            .checked_sub(1)
            .ok_or(ContractError::InsufficientBalance)?;
        let payout = gross_payout
            .checked_sub(fee)
            .ok_or(ContractError::InsufficientAmount)?;
        let fee_raw = boxmeout_shared::math::denormalize_token_amount_floor(
            fee,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let payout_raw = boxmeout_shared::math::denormalize_token_amount_floor(
            payout,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let fee_paid = boxmeout_shared::math::normalize_token_amount(
            fee_raw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let payout_paid = boxmeout_shared::math::normalize_token_amount(
            payout_raw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let total_paid = fee_paid
            .checked_add(payout_paid)
            .ok_or(ContractError::InsufficientAmount)?;
        let treasury: Address = env
            .storage()
            .persistent()
            .get(&TREASURY)
            .ok_or(ContractError::NotFactory)?;
        Self::require_market_token(&env, &token)?;

        pool.collateral = pool
            .collateral
            .checked_sub(total_paid)
            .ok_or(ContractError::InsufficientBalance)?;
        pool.outstanding_shares = pool
            .outstanding_shares
            .checked_sub(shares_held)
            .ok_or(ContractError::InsufficientBalance)?;
        pool.outstanding_a = pool
            .outstanding_a
            .checked_sub(position.shares_a)
            .ok_or(ContractError::InsufficientBalance)?;
        pool.outstanding_b = pool
            .outstanding_b
            .checked_sub(position.shares_b)
            .ok_or(ContractError::InsufficientBalance)?;
        pool.outstanding_draw = pool
            .outstanding_draw
            .checked_sub(position.shares_draw)
            .ok_or(ContractError::InsufficientBalance)?;
        position.shares_a = 0;
        position.shares_b = 0;
        position.shares_draw = 0;
        position.claimed = true;
        env.storage()
            .persistent()
            .set(&AMM_REFUND_LIABILITY, &refund_liability);
        env.storage()
            .persistent()
            .set(&AMM_ACTIVE_TRADERS, &active_traders);
        Self::save_amm_pool(&env, &pool);
        Self::save_amm_position(&env, &trader, &position);
        Self::extend_market_ttl(&env);
        env.storage().instance().set(&CLAIMING, &true);
        let token_client = token::Client::new(&env, &token);
        if fee_raw > 0 {
            token_client.transfer(&env.current_contract_address(), &treasury, &fee_raw);
        }
        if payout_raw > 0 {
            token_client.transfer(&env.current_contract_address(), &trader, &payout_raw);
        }
        env.storage().instance().set(&CLAIMING, &false);
        Ok(payout_paid)
    }

    // =========================================================================
    // LOCK MARKET
    // =========================================================================
    /// Locks the market when the fight is about to start.
    ///
    /// # Errors
    /// - `NotOracle`: Caller is not a whitelisted oracle or admin
    /// - `MarketNotOpen`: Market is not open or already locked
    /// - `InvalidTimeRange`: Lock threshold has not been reached yet
    pub fn lock_market(env: Env, caller: Address) -> Result<(), ContractError> {
        // CHECKS
        caller.require_auth();
        Self::require_not_paused(&env)?;

        // Caller must be a whitelisted oracle OR the factory admin
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if caller != factory && !Self::is_oracle_whitelisted(&env, &caller)? {
            return Err(ContractError::NotOracle);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Open {
            return Err(ContractError::InvalidMarketStatus);
        }

        let lock_threshold = state
            .fight
            .scheduled_at
            .saturating_sub(state.config.lock_before_secs);
        if env.ledger().timestamp() < lock_threshold {
            return Err(ContractError::InvalidTimeRange);
        }

        // EFFECTS
        state.status = MarketStatus::Locked;
        Self::save_state(&env, &state);
        Self::extend_market_ttl(&env);

        boxmeout_shared::emit_market_locked(&env, state.market_id);
        Ok(())
    }

    // =========================================================================
    // RESOLVE MARKET — 2-of-3 Oracle Consensus
    // =========================================================================
    /// Submits an oracle report for market resolution using 2-of-3 consensus.
    ///
    /// # Errors
    /// - `NotOracle`: Caller is not a whitelisted oracle
    /// - `MarketNotOpen`: Market is not locked
    /// - `ResolutionWindowExpired`: Resolution deadline has passed
    /// - `InvalidOracleSignature`: Signature verification failed
    /// - `Unauthorized`: Oracle has already submitted a report
    pub fn resolve_market(
        env: Env,
        oracle: Address,
        report: OracleReport,
    ) -> Result<(), ContractError> {
        // CHECKS
        oracle.require_auth();
        Self::require_not_paused(&env)?;

        if !Self::is_oracle_whitelisted(&env, &oracle)? {
            return Err(ContractError::NotOracle);
        }

        // Look up the whitelisted raw public key for this oracle address.
        // This is the authoritative 32-byte Ed25519 key registered by the admin.
        let whitelisted_pub_key: BytesN<32> =
            Self::get_oracle_raw_key(&env, &oracle)?.ok_or(ContractError::NotOracle)?;

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Locked {
            return Err(ContractError::InvalidMarketStatus);
        }
        let market_outcome_version: u32 = env
            .storage()
            .persistent()
            .get(&OUTCOME_VERSION)
            .unwrap_or(LEGACY_OUTCOME_VERSION);
        boxmeout_shared::validate_report_outcome_version(
            market_outcome_version,
            report.outcome_version,
        )?;

        if env.ledger().timestamp() < state.fight.scheduled_at {
            return Err(ContractError::MarketNotStarted);
        }

        let deadline = state.fight.scheduled_at

        let deadline = state
            .fight
            .scheduled_at
            .saturating_add(state.config.resolution_window);
        if env.ledger().timestamp() > deadline {
            return Err(ContractError::ResolutionWindowExpired);
        }

        if report.oracle_address != oracle {
            return Err(ContractError::InvalidOracleSignature);
        }

        // Verify Ed25519 signature over match_id, outcome, timestamp, and schema version.
        // Use the authoritative key from the whitelist — NOT report.pub_key — to prevent
        // a malicious oracle from substituting a different key in the report payload.
        {
            use soroban_sdk::xdr::ToXdr;
            use soroban_sdk::Bytes;
            let outcome_byte: u8 = match report.outcome {
                Outcome::FighterA => 0,
                Outcome::FighterB => 1,
                Outcome::Draw => 2,
                Outcome::NoContest => 3,
            };
            let mut msg = Bytes::new(&env);
            // Encode match_id as its XDR bytes for signing
            msg.append(&report.match_id.clone().to_xdr(&env));
            msg.push_back(outcome_byte);
            for b in report.reported_at.to_be_bytes().iter() {
                msg.push_back(*b);
            }
            for b in report.outcome_version.to_be_bytes().iter() {
                msg.push_back(*b);
            }
            // whitelisted_pub_key is the raw 32-byte Ed25519 key registered by the admin.
            // This is correct — unlike oracle.to_string().to_bytes() which is base32-encoded.
            env.crypto()
                .ed25519_verify(&whitelisted_pub_key, &msg, &report.signature);
        }

        // EFFECTS — 2-of-3 consensus logic
        let mut pending: Map<Address, OracleReport> = env
            .storage()
            .persistent()
            .get(&PENDING_REPORTS)
            .unwrap_or_else(|| Map::new(&env));

        // Check if we already have a report from this oracle
        if pending.contains_key(oracle.clone()) {
            return Err(ContractError::Unauthorized);
        }

        // Store this report
        pending.set(oracle.clone(), report.clone());
        env.storage().persistent().set(&PENDING_REPORTS, &pending);

        // Count matching and conflicting reports
        let mut matching_count = 1u32;
        let mut conflicting_count = 0u32;

        for (stored_oracle, stored_report) in pending.iter() {
            if stored_oracle != oracle {
                if stored_report.outcome == report.outcome {
                    matching_count += 1;
                } else {
                    conflicting_count += 1;
                }
            }
        }

        // Derive the tier byte for consensus events.
        let tier_byte: u8 = match &state.tier {
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier8)  => 8,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier10) => 10,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier12) => 12,
            OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier14) => 14,
            OptionalMarketTier::None => 0,
        };

        let outcome_byte: u32 = match report.outcome {

        // Emit structured event for real-time frontend progress updates
        let outcome_index: u32 = match report.outcome {
            Outcome::FighterA  => 0,
            Outcome::FighterB  => 1,
            Outcome::Draw      => 2,
            Outcome::NoContest => 3,
        };

        // Emit oracle_report_received so frontends can track resolution progress.
        boxmeout_shared::emit_oracle_report_received(
            &env,
            state.market_id,
            oracle.clone(),
            outcome_byte,
            pending.len(),
        );

        // Resolve if we have 2 matching reports (2-of-3 consensus, issues #473–#476).
        let consensus_threshold = boxmeout_shared::amm::tier_oracle_consensus_threshold(tier_byte);
        if matching_count >= consensus_threshold {

        boxmeout_shared::emit_oracle_report_submitted(
            &env,
            state.market_id,
            oracle.clone(),
            outcome_index,
            matching_count,
        );

        // Circuit Breaker: when consensus is reached, enter ResolutionPending
        // instead of immediately resolving. This gives admins a configurable
        // cooldown window to raise a dispute before payouts are unlocked.
        if matching_count >= 2 {
            state.outcome = OptionalOutcome::Some(report.outcome.clone());
            env.storage().persistent().set(
                &VERSIONED_OUTCOME,
                &VersionedOutcome {
                    version: report.outcome_version,
                    outcome: report.outcome.clone(),
                },
            );

            // Determine cooldown length (ledgers). Fall back to the default if
            // the market was created before dispute_cooldown_ledgers was added.
            let cooldown = if state.config.dispute_cooldown_ledgers > 0 {
                state.config.dispute_cooldown_ledgers
            } else {
                DEFAULT_DISPUTE_COOLDOWN_LEDGERS
            };

            let cooldown_end_ledger = env.ledger().sequence().saturating_add(cooldown);

            state.status = MarketStatus::ResolutionPending;
            state.oracle_used = OptionalOracleRole::Some(OracleRole::Primary);
            Self::save_state(&env, &state);
            Self::extend_market_ttl(&env);

            // Persist the cooldown end ledger so finalize_resolution can check it.
            env.storage()
                .persistent()
                .set(&COOLDOWN_END_LEDGER, &cooldown_end_ledger);

            // Clear pending reports — they are no longer needed.
            env.storage().persistent().set(&PENDING_REPORTS, &Map::<Address, OracleReport>::new(&env));

            // Emit consensus_reached first so subscribers can correlate.
            boxmeout_shared::emit_consensus_reached(
                &env,
                state.market_id,
                tier_byte as u32,
                matching_count,
                outcome_byte,
            );

            // Emit market_resolution_pending — frontends display the cooldown
            // countdown and dispute submission UI during this window.
            boxmeout_shared::emit_market_resolution_pending(
                &env,
                state.market_id,
                outcome_byte,
                cooldown_end_ledger,
            );
        } else if conflicting_count > 0 && matching_count == 1 {
            // Emit event for conflicting report, wait for third oracle
            boxmeout_shared::emit_conflicting_oracle_report(&env, state.market_id, oracle);
        }

        Ok(())
    }

    /// Clears oracle reports from PENDING_REPORTS that are older than REPORT_TTL.
    /// Callable by factory / admin. Returns the number of evicted reports.
    pub fn clear_stale_reports(env: Env, caller: Address) -> Result<u32, ContractError> {
        caller.require_auth();
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if caller != factory {
            return Err(ContractError::Unauthorized);
        }

        let pending: Map<Address, OracleReport> = env
            .storage()
            .persistent()
            .get(&PENDING_REPORTS)
            .unwrap_or_else(|| Map::new(&env));
        let now = env.ledger().timestamp();
        let mut updated: Map<Address, OracleReport> = Map::new(&env);
        let mut cleared = 0u32;

        for (addr, rep) in pending.iter() {
            if now.saturating_sub(rep.reported_at) >= REPORT_TTL {
                cleared += 1;
            } else {
                updated.set(addr, rep);
            }
        }

        env.storage().persistent().set(&PENDING_REPORTS, &updated);
        Ok(cleared)
    }

    // =========================================================================
    // FINALIZE RESOLUTION — callable by anyone after cooldown window
    // =========================================================================
    /// Finalizes a market that is in `ResolutionPending` state once the dispute
    /// cooldown window has elapsed.
    ///
    /// This function is permissionless — any address can call it once the
    /// `cooldown_end_ledger` has been passed, which avoids relying on a
    /// privileged keeper bot.
    ///
    /// If the cooldown window is still active this function returns
    /// `DisputeCooldownActive`. If the market has been moved to `Disputed`
    /// (admin froze the resolution) this returns `ResolutionNotPending`.
    ///
    /// # Errors
    /// - `ResolutionNotPending`: Market is not in ResolutionPending state
    /// - `DisputeCooldownActive`: Cooldown window has not yet elapsed
    pub fn finalize_resolution(env: Env) -> Result<(), ContractError> {
        Self::require_not_paused(&env)?;

        let mut state = Self::load_state(&env)?;

        // Only valid to call when the market is waiting for the cooldown to expire.
        if state.status != MarketStatus::ResolutionPending {
            return Err(ContractError::ResolutionNotPending);
        }

        let market_outcome_version: u32 = env
            .storage()
            .persistent()
            .get(&OUTCOME_VERSION)
            .unwrap_or(LEGACY_OUTCOME_VERSION);
        boxmeout_shared::validate_outcome_version(market_outcome_version)?;
        let versioned_outcome: VersionedOutcome = env
            .storage()
            .persistent()
            .get(&VERSIONED_OUTCOME)
            .ok_or(ContractError::InvalidOutcome)?;
        if versioned_outcome.version != market_outcome_version
            || state.outcome != OptionalOutcome::Some(versioned_outcome.outcome.clone())
        {
            return Err(ContractError::InvalidOutcomeVersion);
        }

        // Check that the cooldown window has elapsed.
        let cooldown_end_ledger: u32 = env
            .storage()
            .persistent()
            .get(&COOLDOWN_END_LEDGER)
            .unwrap_or(0);

        if env.ledger().sequence() < cooldown_end_ledger {
            return Err(ContractError::DisputeCooldownActive);
        }

        // ── EFFECTS ──────────────────────────────────────────────────────────
        state.status = MarketStatus::Resolved;
        state.resolved_at = env.ledger().timestamp();
        Self::save_state(&env, &state);
        Self::extend_market_ttl(&env);

        // Clean up the cooldown ledger entry — no longer needed.
        env.storage().persistent().remove(&COOLDOWN_END_LEDGER);

        let outcome_byte: u8 = match &state.outcome {
            OptionalOutcome::Some(o) => match o {
                boxmeout_shared::types::Outcome::FighterA => 0,
                boxmeout_shared::types::Outcome::FighterB => 1,
                boxmeout_shared::types::Outcome::Draw => 2,
                boxmeout_shared::types::Outcome::NoContest => 3,
            },
            OptionalOutcome::None => return Err(ContractError::InvalidOutcome),
        };

        boxmeout_shared::emit_resolution_finalized(&env, state.market_id, outcome_byte);
        Ok(())
    }

    // =========================================================================
    // CLAIM WINNINGS  — fund-moving
    // =========================================================================
    /// Claims winnings for a bettor who backed the winning outcome.
    ///
    /// # Errors
    /// - `MarketNotResolved`: Market is not resolved
    /// - `InvalidOutcome`: Market outcome is invalid for payout
    /// - `NoBetsFound`: Bettor has no bets in this market
    /// - `AlreadyClaimed`: Bettor has already claimed winnings
    ///
    /// # Security (CEI strictly enforced)
    /// 1. CHECKS: require_auth, pause guard, reentrancy guard, status, eligibility
    /// 2. EFFECTS: mark bets claimed + set CLAIMING lock BEFORE any transfer
    /// 3. INTERACTIONS: treasury fee transfer, then bettor payout transfer
    /// 4. CLEANUP: clear CLAIMING lock
    /// State is NOT re-read after any token transfer.
    pub fn claim_winnings(
        env: Env,
        bettor: Address,
        token: Address,
    ) -> Result<ClaimReceipt, ContractError> {
        // ── CHECKS ────────────────────────────────────────────────────────────
        bettor.require_auth(); // auth first
        Self::require_not_paused(&env)?; // pause guard
        Self::require_not_claiming(&env)?; // reentrancy guard

        // Reload state fresh from storage (never use a stale copy)
        let state = Self::load_state(&env)?;

        if state.status == MarketStatus::Cancelled {
            return Err(ContractError::MarketCancelled);
        }
        if state.status != MarketStatus::Resolved {
            return Err(ContractError::MarketNotResolved);
        }

        let winning_outcome = match state.outcome.clone() {
            OptionalOutcome::Some(o) => o,
            OptionalOutcome::None => return Err(ContractError::InvalidOutcome),
        };

        let winning_side = match &winning_outcome {
            Outcome::FighterA => BetSide::FighterA,
            Outcome::FighterB => BetSide::FighterB,
            Outcome::Draw => BetSide::Draw,
            Outcome::NoContest => return Err(ContractError::InvalidOutcome),
        };

        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return Err(ContractError::NoBetsFound);
        }

        // Sum unclaimed winning bets
        let mut bettor_stake: i128 = 0;
        let mut any_eligible = false;
        for bet in bets.iter() {
            if bet.side == winning_side && !bet.claimed {
                bettor_stake = bettor_stake
                    .checked_add(bet.amount)
                    .ok_or(ContractError::InsufficientAmount)?;
                any_eligible = true;
            }
        }
        if !any_eligible {
            return Err(ContractError::AlreadyClaimed);
        }

        // Parimutuel payout formula (integer arithmetic with checked operations, always floors)
        let winning_pool = match &winning_side {
            BetSide::FighterA => state.pool_a,
            BetSide::FighterB => state.pool_b,
            BetSide::Draw => state.pool_draw,
        };

        // Use checked arithmetic to prevent overflow
        let fee = state
            .total_pool
            .checked_mul(state.config.fee_bps as i128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(ContractError::InsufficientAmount)?;
        let net_pool = state
            .total_pool
            .checked_sub(fee)
            .ok_or(ContractError::InsufficientAmount)?;
        let (payout, fee) = Self::calculate_claim_amounts(
            bettor_stake,
            winning_pool,
            state.total_pool,
            net_pool,
            state.config.fee_bps as i128,
        )?;
        let payout = if winning_pool > 0 {
            bettor_stake
                .checked_mul(net_pool)
                .and_then(|v| v.checked_div(winning_pool))
                .ok_or(ContractError::InsufficientAmount)?
        } else {
            0
        };
        let fee_raw = boxmeout_shared::math::denormalize_token_amount_floor(
            fee,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let payout_raw = boxmeout_shared::math::denormalize_token_amount_floor(
            payout,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let fee_paid = boxmeout_shared::math::normalize_token_amount(
            fee_raw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;
        let payout_paid = boxmeout_shared::math::normalize_token_amount(
            payout_raw,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;

        // ── EFFECTS ───────────────────────────────────────────────────────────
        Self::require_market_token(&env, &token)?;
        // Set reentrancy lock BEFORE any transfer
        env.storage().instance().set(&CLAIMING, &true);

        // Mark all winning bets as claimed
        let mut updated_bets = Vec::new(&env);
        for mut bet in bets.iter() {
            if bet.side == winning_side && !bet.claimed {
                bet.claimed = true;
            }
            updated_bets.push_back(bet);
        }
        Self::save_bets(&env, &bettor, &updated_bets);
        Self::extend_market_ttl(&env);

        let receipt = ClaimReceipt {
            bettor: bettor.clone(),
            market_id: state.market_id,
            amount_won: payout_paid,
            fee_deducted: fee_paid,
            claimed_at: env.ledger().timestamp(),
        };

        // ── INTERACTIONS ──────────────────────────────────────────────────────
        let token_client = token::Client::new(&env, &token);
        let treasury: Address = env
            .storage()
            .persistent()
            .get(&TREASURY)
            .ok_or(ContractError::Unauthorized)?;

        // Transfer fee to treasury first
        if fee_raw > 0 {
            token_client.transfer(&env.current_contract_address(), &treasury, &fee_raw);
        }
        // Transfer payout to bettor
        if payout_raw > 0 {
            token_client.transfer(&env.current_contract_address(), &bettor, &payout_raw);
        }

        // ── CLEANUP ───────────────────────────────────────────────────────────
        env.storage().instance().set(&CLAIMING, &false);
        Self::extend_market_ttl(&env);

        boxmeout_shared::emit_winnings_claimed(&env, state.market_id, receipt.clone());
        Ok(receipt)
    }

    /// Claims winnings for multiple bettors in one atomic invocation.
    ///
    /// Every bettor must authorize the transaction. Duplicate or invalid
    /// claims reject the entire batch before any bet state is changed.
    pub fn batch_claim(
        env: Env,
        bettors: Vec<Address>,
        token: Address,
    ) -> Result<Vec<ClaimReceipt>, ContractError> {
        if bettors.is_empty() {
            return Err(ContractError::InvalidAmount);
        }
        let mut seen_bettors: Map<Address, bool> = Map::new(&env);
        for bettor in bettors.iter() {
            bettor.require_auth();
            if seen_bettors.contains_key(bettor.clone()) {
                return Err(ContractError::InvalidAmount);
            }
            seen_bettors.set(bettor, true);
        }

        Self::require_not_paused(&env)?;
        Self::require_not_claiming(&env)?;

        let state = Self::load_state(&env)?;
        if state.status == MarketStatus::Cancelled {
            return Err(ContractError::MarketCancelled);
        }
        if state.status != MarketStatus::Resolved {
            return Err(ContractError::MarketNotResolved);
        }

        let winning_outcome = match state.outcome.clone() {
            OptionalOutcome::Some(outcome) => outcome,
            OptionalOutcome::None => return Err(ContractError::InvalidOutcome),
        };
        let winning_side = match winning_outcome {
            Outcome::FighterA => BetSide::FighterA,
            Outcome::FighterB => BetSide::FighterB,
            Outcome::Draw => BetSide::Draw,
            Outcome::NoContest => return Err(ContractError::InvalidOutcome),
        };
        let winning_pool = match &winning_side {
            BetSide::FighterA => state.pool_a,
            BetSide::FighterB => state.pool_b,
            BetSide::Draw => state.pool_draw,
        };
        let fee = state
            .total_pool
            .checked_mul(state.config.fee_bps as i128)
            .and_then(|value| value.checked_div(10_000))
            .ok_or(ContractError::InsufficientAmount)?;
        let net_pool = state
            .total_pool
            .checked_sub(fee)
            .ok_or(ContractError::InsufficientAmount)?;
        let treasury: Address = env
            .storage()
            .persistent()
            .get(&TREASURY)
            .ok_or(ContractError::Unauthorized)?;

        let mut prepared_bets: Vec<(Address, Vec<BetRecord>)> = Vec::new(&env);
        let mut receipts = Vec::new(&env);
        let mut total_fee = 0i128;
        for bettor in bettors.iter() {
            let bets = Self::load_bets(&env, &bettor);
            if bets.is_empty() {
                return Err(ContractError::NoBetsFound);
            }

            let mut bettor_stake = 0i128;
            for bet in bets.iter() {
                if bet.side == winning_side && !bet.claimed {
                    bettor_stake = bettor_stake
                        .checked_add(bet.amount)
                        .ok_or(ContractError::InsufficientAmount)?;
                }
            }
            if bettor_stake == 0 {
                return Err(ContractError::AlreadyClaimed);
            }

            let (payout, bettor_fee) = Self::calculate_claim_amounts(
                bettor_stake,
                winning_pool,
                state.total_pool,
                net_pool,
                state.config.fee_bps as i128,
            )?;
            total_fee = total_fee
                .checked_add(bettor_fee)
                .ok_or(ContractError::InsufficientAmount)?;

            let mut updated_bets = Vec::new(&env);
            for mut bet in bets.iter() {
                if bet.side == winning_side && !bet.claimed {
                    bet.claimed = true;
                }
                updated_bets.push_back(bet);
            }
            prepared_bets.push_back((bettor.clone(), updated_bets));
            receipts.push_back(ClaimReceipt {
                bettor: bettor.clone(),
                market_id: state.market_id,
                amount_won: payout,
                fee_deducted: bettor_fee,
                claimed_at: env.ledger().timestamp(),
            });
        }

        // Complete all state effects before invoking the token contract.
        env.storage().instance().set(&CLAIMING, &true);
        for (bettor, updated_bets) in prepared_bets.iter() {
            Self::save_bets(&env, &bettor, &updated_bets);
        }
        Self::extend_market_ttl(&env);

        let token_client = token::Client::new(&env, &token);
        if total_fee > 0 {
            token_client.transfer(&env.current_contract_address(), &treasury, &total_fee);
        }
        for receipt in receipts.iter() {
            if receipt.amount_won > 0 {
                token_client.transfer(
                    &env.current_contract_address(),
                    &receipt.bettor,
                    &receipt.amount_won,
                );
            }
        }

        env.storage().instance().set(&CLAIMING, &false);
        Self::extend_market_ttl(&env);

        for receipt in receipts.iter() {
            boxmeout_shared::emit_winnings_claimed(&env, state.market_id, receipt);
        }
        Ok(receipts)
    }

    // =========================================================================
    // CLAIM REFUND  — fund-moving
    // =========================================================================
    /// Claims a full refund for a bettor when the market is cancelled.
    /// Returns the refund in the shared seven-decimal calculation scale.
    ///
    /// # Errors
    /// - `InvalidMarketStatus`: Market is not cancelled
    /// - `NoBetsFound`: Bettor has no bets in this market
    /// - `AlreadyClaimed`: Bettor has already claimed refund
    ///
    /// # Security (CEI strictly enforced)
    /// 1. CHECKS: require_auth, status guard (Cancelled), pause guard, reentrancy guard
    /// 2. EFFECTS: mark bets claimed + set CLAIMING lock BEFORE transfer
    /// 3. INTERACTIONS: token transfer last
    pub fn claim_refund(env: Env, bettor: Address, token: Address) -> Result<i128, ContractError> {
        // ── CHECKS ────────────────────────────────────────────────────────────
        bettor.require_auth();

        // Status guard is the FIRST check: reject immediately if the market is
        // not Cancelled, before touching the pause flag, reentrancy lock, or
        // iterating any bettor data. This prevents premature fund drains on
        // Open or Locked markets regardless of any other state.
        let state = Self::load_state(&env)?;
        if state.status != MarketStatus::Cancelled {
            return Err(ContractError::InvalidMarketStatus);
        }

        Self::require_not_paused(&env)?;
        Self::require_not_claiming(&env)?;

        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return Err(ContractError::NoBetsFound);
        }

        let mut refund_total: i128 = 0;
        let mut any_unclaimed = false;
        for bet in bets.iter() {
            if !bet.claimed {
                refund_total = refund_total
                    .checked_add(bet.amount)
                    .ok_or(ContractError::InsufficientAmount)?;
                any_unclaimed = true;
            }
        }
        if !any_unclaimed {
            return Err(ContractError::AlreadyClaimed);
        }

        let refund_total_raw = boxmeout_shared::math::denormalize_token_amount(
            refund_total,
            state.config.token_decimals,
        )
        .ok_or(ContractError::InvalidTokenPrecision)?;

        // ── EFFECTS ───────────────────────────────────────────────────────────
        Self::require_market_token(&env, &token)?;
        env.storage().instance().set(&CLAIMING, &true);

        let mut updated_bets = Vec::new(&env);
        for mut bet in bets.iter() {
            if !bet.claimed {
                bet.claimed = true;
            }
            updated_bets.push_back(bet);
        }
        Self::save_bets(&env, &bettor, &updated_bets);
        Self::extend_market_ttl(&env);

        // ── INTERACTIONS ──────────────────────────────────────────────────────
        let token_client = token::Client::new(&env, &token);
        if refund_total > 0 {
            token_client.transfer(&env.current_contract_address(), &bettor, &refund_total_raw);
        }

        // ── CLEANUP ───────────────────────────────────────────────────────────
        env.storage().instance().set(&CLAIMING, &false);
        Self::extend_market_ttl(&env);

        boxmeout_shared::emit_refund_claimed(&env, state.market_id, bettor, refund_total);
        Ok(refund_total)
    }

    // =========================================================================
    // CANCEL MARKET
    // =========================================================================
    /// Cancels the market, making all bets eligible for refund.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not a whitelisted oracle or admin
    /// - `InvalidMarketStatus`: Market is not Open or Locked
    pub fn cancel_market(
        env: Env,
        caller: Address,
        reason: soroban_sdk::String,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        Self::require_not_paused(&env)?;

        // Caller must be a whitelisted oracle OR the factory admin
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if caller != factory && !Self::is_oracle_whitelisted(&env, &caller)? {
            return Err(ContractError::NotOracle);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Open && state.status != MarketStatus::Locked {
            return Err(ContractError::InvalidMarketStatus);
        }

        state.status = MarketStatus::Cancelled;
        Self::save_state(&env, &state);
        Self::extend_market_ttl(&env);

        boxmeout_shared::emit_market_cancelled(&env, state.market_id, reason);
        Ok(())
    }

    // =========================================================================
    // DISPUTE MARKET
    // =========================================================================
    /// Disputes a resolved market, freezing claims pending admin review.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the factory (admin)
    /// - `InvalidMarketStatus`: Market is not resolved
    pub fn dispute_market(
        env: Env,
        admin: Address,
        reason: soroban_sdk::String,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_not_paused(&env)?;

        // Admin must be the factory address (factory is the privileged admin)
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
        }

        let mut state = Self::load_state(&env)?;
        // Allow dispute during both Resolved and ResolutionPending states.
        // ResolutionPending is the circuit breaker window — this is the primary
        // use-case for the emergency pause path introduced by issue #562.
        if state.status != MarketStatus::Resolved && state.status != MarketStatus::ResolutionPending {
            return Err(ContractError::InvalidMarketStatus);
        }

        state.status = MarketStatus::Disputed;
        Self::save_state(&env, &state);
        Self::extend_market_ttl(&env);

        boxmeout_shared::emit_market_disputed(&env, state.market_id, reason);
        Ok(())
    }

    // =========================================================================
    // RESOLVE DISPUTE
    // =========================================================================
    /// Resolves a disputed market with a final admin-determined outcome.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the factory (admin)
    /// - `InvalidMarketStatus`: Market is not disputed
    pub fn resolve_dispute(
        env: Env,
        admin: Address,
        final_outcome: Outcome,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_not_paused(&env)?;

        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Disputed {
            return Err(ContractError::InvalidMarketStatus);
        }
        let outcome_version: u32 = env
            .storage()
            .persistent()
            .get(&OUTCOME_VERSION)
            .unwrap_or(LEGACY_OUTCOME_VERSION);
        boxmeout_shared::validate_outcome_version(outcome_version)?;

        // EFFECTS
        state.outcome = OptionalOutcome::Some(final_outcome.clone());
        env.storage().persistent().set(
            &VERSIONED_OUTCOME,
            &VersionedOutcome {
                version: outcome_version,
                outcome: final_outcome.clone(),
            },
        );
        state.status = MarketStatus::Resolved;
        state.resolved_at = env.ledger().timestamp();
        state.oracle_used = OptionalOracleRole::Some(OracleRole::Admin);
        Self::save_state(&env, &state);
        Self::extend_market_ttl(&env);

        // Include the admin address so on-chain audits can distinguish
        // oracle-resolved markets from admin-overridden (dispute) resolutions.
        boxmeout_shared::emit_market_resolved(&env, state.market_id, final_outcome, admin);
        Ok(())
    }

    /// Migrates a legacy market's stored outcome schema. The migration is
    /// deterministic and permissionless; pending legacy reports are discarded
    /// because their serialized schema and signatures predate version tagging.
    pub fn migrate_outcome_version(
        env: Env,
        target_version: u32,
    ) -> Result<(), ContractError> {
        let source_version: u32 = env
            .storage()
            .persistent()
            .get(&OUTCOME_VERSION)
            .unwrap_or(LEGACY_OUTCOME_VERSION);
        let state = Self::load_state(&env)?;
        if let OptionalOutcome::Some(outcome) = state.outcome {
            let migrated = boxmeout_shared::migrate_outcome_version(
                &VersionedOutcome {
                    version: source_version,
                    outcome,
                },
                target_version,
            )?;
            env.storage().persistent().set(&VERSIONED_OUTCOME, &migrated);
        } else if source_version != LEGACY_OUTCOME_VERSION
            || target_version != CURRENT_OUTCOME_VERSION
        {
            return Err(ContractError::InvalidOutcomeVersion);
        }
        env.storage().persistent().set(&OUTCOME_VERSION, &target_version);
        env.storage()
            .persistent()
            .set(&PENDING_REPORTS, &Map::<Address, OracleReport>::new(&env));
        Self::extend_market_ttl(&env);
        Ok(())
    }

    // =========================================================================
    // READ-ONLY FUNCTIONS
    // =========================================================================

    /// Returns the current state of the market.
    pub fn get_state(env: Env) -> Result<MarketState, ContractError> {
        Self::load_state(&env)
    }

    /// Returns the current outcome together with its schema version.
    pub fn get_versioned_outcome(env: Env) -> Result<VersionedOutcome, ContractError> {
        let version: u32 = env
            .storage()
            .persistent()
            .get(&OUTCOME_VERSION)
            .unwrap_or(LEGACY_OUTCOME_VERSION);
        let versioned: Option<VersionedOutcome> = env
            .storage()
            .persistent()
            .get(&VERSIONED_OUTCOME);
        if let Some(outcome) = versioned {
            return if outcome.version == version {
                Ok(outcome)
            } else {
                Err(ContractError::InvalidOutcomeVersion)
            };
        }

        let state = Self::load_state(&env)?;
        match state.outcome {
            OptionalOutcome::Some(outcome) => Ok(VersionedOutcome { version, outcome }),
            OptionalOutcome::None => Err(ContractError::InvalidOutcome),
        }
    }

    /// Returns all bets placed by a specific bettor.
    pub fn get_bets_by_address(env: Env, bettor: Address) -> Vec<BetRecord> {
        Self::load_bets(&env, &bettor)
    }

    /// Returns the bettor's first unclaimed bet position, or None if no bet exists.
    pub fn get_bet(env: Env, bettor: Address) -> Option<BetRecord> {
        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return None;
        }
        Some(bets.get(0).unwrap())
    }

    /// Returns the current odds for each outcome (in basis points).
    pub fn get_current_odds(env: Env) -> (u32, u32, u32) {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return (0, 0, 0),
        };
        if state.total_pool == 0 {
            return (0, 0, 0);
        }
        let odds_a = match state.pool_a.checked_mul(10_000) {
            Some(value) => (value / state.total_pool) as u32,
            None => return (0, 0, 0),
        };
        let odds_b = match state.pool_b.checked_mul(10_000) {
            Some(value) => (value / state.total_pool) as u32,
            None => return (0, 0, 0),
        };
        let odds_draw = match state.pool_draw.checked_mul(10_000) {
            Some(value) => (value / state.total_pool) as u32,
            None => return (0, 0, 0),
        };
        (odds_a, odds_b, odds_draw)
    }

    /// Estimates the payout for a hypothetical bet. `amount` is in native token
    /// units; the returned amount uses the shared seven-decimal calculation scale.
    pub fn estimate_payout(env: Env, side: BetSide, amount: i128) -> i128 {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        if state.status != MarketStatus::Open {
            return 0;
        }
        let amount = match boxmeout_shared::math::normalize_token_amount(
            amount,
            state.config.token_decimals,
        ) {
            Some(amount) if amount > 0 => amount,
            _ => return 0,
        };
        let (hypo_a, hypo_b, hypo_draw) = match side {
            BetSide::FighterA => match state.pool_a.checked_add(amount) {
                Some(pool_a) => (pool_a, state.pool_b, state.pool_draw),
                None => return 0,
            },
            BetSide::FighterB => match state.pool_b.checked_add(amount) {
                Some(pool_b) => (state.pool_a, pool_b, state.pool_draw),
                None => return 0,
            },
            BetSide::Draw => match state.pool_draw.checked_add(amount) {
                Some(pool_draw) => (state.pool_a, state.pool_b, pool_draw),
                None => return 0,
            },
        };
        let hypo_total = match state.total_pool.checked_add(amount) {
            Some(total) => total,
            None => return 0,
        };
        let winning_pool = match side {
            BetSide::FighterA => hypo_a,
            BetSide::FighterB => hypo_b,
            BetSide::Draw => hypo_draw,
        };
        if winning_pool == 0 {
            return 0;
        }
        let fee = match hypo_total
            .checked_mul(state.config.fee_bps as i128)
            .map(|fee| fee / 10_000)
        {
            Some(fee) => fee,
            None => return 0,
        };
        let net_pool = match hypo_total.checked_sub(fee) {
            Some(pool) => pool,
            None => return 0,
        };
        amount
            .checked_mul(net_pool)
            .map(|payout| payout / winning_pool)
            .unwrap_or(0)
    }

    /// Returns the number of unique bettors in this market.
    pub fn get_bettor_count(env: Env) -> u32 {
        let list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&BETTOR_LIST)
            .unwrap_or_else(|| Vec::new(&env));
        list.len()
    }

    /// Returns a paginated list of all bet records across all bettors.
    /// `limit` is capped at 50. Returns an empty vec if no bets exist.
    pub fn get_all_bets(env: Env, offset: u32, limit: u32) -> Vec<BetRecord> {
        let cap: u32 = if limit > 50 { 50 } else { limit };
        let bettor_list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&BETTOR_LIST)
            .unwrap_or_else(|| Vec::new(&env));

        let mut all: Vec<BetRecord> = Vec::new(&env);
        for addr in bettor_list.iter() {
            for r in Self::load_bets(&env, &addr).iter() {
                all.push_back(r);
            }
        }

        let total = all.len();
        let mut result: Vec<BetRecord> = Vec::new(&env);
        let start = offset;
        let end = (offset + cap).min(total);
        if start >= total {
            return result;
        }
        for i in start..end {
            result.push_back(all.get(i).unwrap());
        }
        result
    }

    /// Returns current pool sizes for each outcome in the shared seven-decimal scale.
    pub fn get_pool_sizes(env: Env) -> (i128, i128, i128) {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return (0, 0, 0),
        };
        (state.pool_a, state.pool_b, state.pool_draw)
    }

    /// Returns true if the bettor has already claimed winnings or a refund.
    /// Returns false if the bettor has not placed any bet in this market.
    pub fn has_claimed(env: Env, bettor: Address) -> bool {
        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return Self::load_amm_position(&env, &bettor)
                .map(|position| position.claimed)
                .unwrap_or(false);
        }
        bets.iter().all(|b| b.claimed)
            && Self::load_amm_position(&env, &bettor)
                .map(|position| position.claimed)
                .unwrap_or(true)
    }

    /// Returns the current status of the market.
    pub fn get_status(env: Env) -> Result<MarketStatus, ContractError> {
        Ok(Self::load_state(&env)?.status)
    }

    /// Returns the three normalized pool sizes as `(pool_a, pool_b, pool_draw)`.
    /// Alias for `get_pool_sizes` — returns `(0, 0, 0)` if not initialized.
    pub fn get_pools(env: Env) -> (i128, i128, i128) {
        match Self::load_state(&env) {
            Ok(s) => (s.pool_a, s.pool_b, s.pool_draw),
            Err(_) => (0, 0, 0),
        }
    }

    /// Returns the AMM tier byte for this market (8 / 10 / 12 / 14 / 0).
    ///
    /// Returns `0` if no tier was assigned at initialization.
    /// Frontends can use this to display the correct slippage warning level.
    pub fn get_tier(env: Env) -> u32 {
        match Self::load_state(&env) {
            Ok(s) => match s.tier {
                OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier8)  => 8,
                OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier10) => 10,
                OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier12) => 12,
                OptionalMarketTier::Some(boxmeout_shared::types::MarketTier::Tier14) => 14,
                OptionalMarketTier::None => 0,
            },
            Err(_) => 0,
        }
    }

    /// Returns the market tier configured at initialization.
    ///
    /// The tier determines the pool depth requirements and per-bet slippage
    /// tolerance for this market instance (e.g. 18 = Tier 18, 20 = Tier 20).
    /// Returns 0 if the market has not been initialized or uses the default tier.
    ///
    /// Indexers and the frontend use this to group markets by tier and apply
    /// tier-specific UI parameters (bet limits, display labels, etc.).
    pub fn get_market_tier(env: Env) -> u32 {
        match Self::load_state(&env) {
            Ok(s) => s.config.tier,
            Err(_) => 0,
        }
    }

    /// Returns the native token precision configured for this market.
    pub fn get_token_decimals(env: Env) -> Result<u32, ContractError> {
        Ok(Self::load_state(&env)?.config.token_decimals)
    }

    /// Returns the live AMM odds (shares_out, impact_bps) for a hypothetical bet.
    ///
    /// Useful for frontends to display real-time odds before the bettor confirms.
    ///
    /// # Arguments
    /// * `side`   - 0 = FighterA, 1 = FighterB, 2 = Draw
    /// * `amount` - Hypothetical bet amount in native token units
    ///
    /// # Returns
    /// `(shares_out, impact_bps)` using normalized token units, or `(0, 0)` if
    /// the AMM is not yet active or the amount cannot be represented exactly.
    pub fn get_amm_odds(env: Env, side: u32, amount: i128) -> (i128, i128) {
        if side > 2 {
            return (0, 0);
        }
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return (0, 0),
        };
        let pool = match Self::load_amm_pool(&env) {
            Some(pool) => pool,
            None => return (0, 0),
        };
        if pool.reserve_a <= 0 || pool.reserve_b <= 0 || pool.reserve_draw <= 0 || amount <= 0 {
            return (0, 0);
        }
        let amount = match boxmeout_shared::math::normalize_token_amount(
            amount,
            state.config.token_decimals,
        ) {
            Some(amount) => amount,
            None => return (0, 0),
        };
        match boxmeout_shared::amm::compute_odds(
            pool.reserve_a,
            pool.reserve_b,
            pool.reserve_draw,
            amount,
            side as u8,
        ) {
            Some((shares, impact)) => (shares, impact),
            None => (0, 0),
        }
    }

    /// Returns a quote for selling shared-scale outcome shares to the AMM.
    pub fn get_amm_sell_quote(env: Env, side: u32, shares_in: i128) -> (i128, i128) {
        if side > 2 || shares_in <= 0 {
            return (0, 0);
        }
        let pool = match Self::load_amm_pool(&env) {
            Some(pool) => pool,
            None => return (0, 0),
        };
        match boxmeout_shared::amm::compute_sell_quote(
            pool.reserve_a,
            pool.reserve_b,
            pool.reserve_draw,
            shares_in,
            side as u8,
        ) {
            Some((amount_out, impact)) => (amount_out, impact),
            None => (0, 0),
        }
    }

    /// Returns AMM reserves, collateral, outstanding shares, and LP share supply.
    pub fn get_amm_pool(env: Env) -> (i128, i128, i128, i128, i128, i128) {
        match Self::load_amm_pool(&env) {
            Some(pool) => (
                pool.reserve_a,
                pool.reserve_b,
                pool.reserve_draw,
                pool.collateral,
                pool.outstanding_shares,
                env.storage()
                    .persistent()
                    .get(&LP_TOTAL_SHARES)
                    .unwrap_or(0),
            ),
            None => (0, 0, 0, 0, 0, 0),
        }
    }

    /// Returns a trader's outstanding AMM shares in A, B, Draw order.
    pub fn get_amm_position(env: Env, trader: Address) -> (i128, i128, i128) {
        match Self::load_amm_position(&env, &trader) {
            Some(position) if !position.claimed => (
                position.shares_a,
                position.shares_b,
                position.shares_draw,
            ),
            _ => (0, 0, 0),
        }
    }

    // =========================================================================
    // ADMIN CONFIG FUNCTIONS
    // =========================================================================

    /// Sets the dispute window duration.
    ///
    /// # Errors
    /// - `Unauthorized`: Window is less than 1 hour or caller is not admin
    pub fn set_dispute_window(
        env: Env,
        admin: Address,
        window_secs: u64,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        if window_secs < 3600 {
            return Err(ContractError::Unauthorized);
        }
        let mut config: Config = env.storage().persistent().get(&CONFIG).unwrap_or(Config {
            dispute_window_secs: 86400,
            min_liquidity: 1_000_000,
        });
        config.dispute_window_secs = window_secs;
        env.storage().persistent().set(&CONFIG, &config);
        boxmeout_shared::emit_config_updated(
            &env,
            soroban_sdk::String::from_str(&env, "dispute_window_secs"),
            window_secs as i128,
        );
        Ok(())
    }

    /// Sets the minimum liquidity requirement.
    ///
    /// # Errors
    /// - `Unauthorized`: Minimum liquidity is not positive or caller is not admin
    pub fn set_min_liquidity(
        env: Env,
        admin: Address,
        min_liquidity: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        if min_liquidity <= 0 {
            return Err(ContractError::Unauthorized);
        }
        let mut config: Config = env.storage().persistent().get(&CONFIG).unwrap_or(Config {
            dispute_window_secs: 86400,
            min_liquidity: 1_000_000,
        });
        config.min_liquidity = min_liquidity;
        env.storage().persistent().set(&CONFIG, &config);
        boxmeout_shared::emit_config_updated(
            &env,
            soroban_sdk::String::from_str(&env, "min_liquidity"),
            min_liquidity,
        );
        Ok(())
    }

    /// Returns the claimable LP fee amount for a liquidity provider in a market.
    ///
    /// Reads `lp_fee_per_share` and the provider's `lp_position` from storage
    /// and computes the unclaimed fee using the fee-per-share accumulator pattern.
    /// Returns `0` if no position exists.
    pub fn get_lp_claimable_fees(env: Env, _market_id: u64, provider: Address) -> i128 {
        let lp_fee_per_share: i128 = env
            .storage()
            .persistent()
            .get(&LP_FEE_PER_SHARE)
            .unwrap_or(0);
        match Self::load_lp_position(&env, &provider) {
            Some(position) => boxmeout_shared::calc_claimable_lp_fees(
                lp_fee_per_share,
                position.fee_debt,
                position.lp_shares,
            ),
            None => 0,
        }
    }

    /// Emergency pause — blocks all fund-moving operations.
    /// Only callable by the factory (admin).
    pub fn emergency_pause(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
        }
        env.storage().instance().set(&PAUSED, &true);
        Ok(())
    }

    /// Lifts the emergency pause.
    pub fn emergency_unpause(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
        }
        env.storage().instance().set(&PAUSED, &false);
        Ok(())
    }

    /// Upgrades the contract WASM. Only callable by the factory's registered admin.
    ///
    /// Cross-calls `factory.get_admin()` to retrieve the authoritative admin address
    /// and rejects the call if `admin` does not match. This prevents any address
    /// (including the factory contract itself) from triggering an upgrade without
    /// holding the factory's registered admin key.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the factory admin
    /// - `NotFactory`: Factory address not found in storage
    /// - `NotAdmin`: Caller is not the factory's registered admin
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        // Cross-call the factory to retrieve its authoritative admin address.
        // Comparing against the factory CONTRACT address (as before) is insufficient —
        // the factory's admin is a separate account that the factory tracks internally.
        let factory_client = FactoryClient::new(&env, &factory);
        let factory_admin = factory_client.get_admin();
        if admin != factory_admin {
            return Err(ContractError::NotAdmin);
        }
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());
        boxmeout_shared::emit_contract_upgraded(&env, new_wasm_hash);
        Ok(())
    }
}
