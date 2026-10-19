# Optional outcome-share AMM

Markets retain their existing pari-mutuel betting path. A market opts into the
AMM when a liquidity provider calls `add_liquidity`; until then, AMM trading is
unavailable and the legacy betting pools are unaffected.

## Pool model

The AMM has virtual share reserves for Fighter A, Fighter B, and Draw, plus a
separate collateral balance. The reserve composition determines the price:

| Trade | Input reserve | Output reserve |
| --- | --- | --- |
| Buy Fighter A | Draw | Fighter A |
| Buy Fighter B | Draw | Fighter B |
| Buy Draw | Fighter A | Draw |

For each trade, the pair's constant-product invariant is preserved. For input
amount `x`, input reserve `Rin`, and output reserve `Rout`, the new output
reserve is `ceil(Rin * Rout / (Rin + x))`. Rounding the reserve up protects
the invariant from integer truncation. The output shares are the decrease in
the output reserve. Selling reverses that trade and rounds collateral output
down. Trades move the reserve ratio, so later quotes reflect the changed odds.

The contract tracks total outstanding shares as collateral liabilities. Buys
are rejected unless pool collateral after the trade covers both outstanding
shares and net deposits refundable if the market is cancelled. LP withdrawals
cannot reduce collateral below either liability. On resolution, winning shares
redeem one unit of collateral per share (less the configured market fee);
losing shares are cleared. On cancellation, a trader can reclaim positive net
collateral contributed through AMM trades.

Liquidity provision seeds all three reserves with the same market token.
Subsequent deposits must match the existing reserve ratios so they do not
change prices. LP shares represent a proportional claim on pool collateral.
There are no AMM trading incentives or yield-farming rewards.

## Contract entry points

- `add_liquidity(provider, amount_a, amount_b, amount_draw, token, min_lp_shares_out)`
  initializes the pool or adds proportional liquidity.
- `remove_liquidity(provider, lp_shares_to_burn, token)` withdraws collateral.
  Withdrawals are available while the market is open. After resolution, LPs
  may withdraw collateral above any remaining winning-share liability. After
  cancellation or a No Contest, all trader refunds must be settled first.
- `buy_shares(trader, side, amount, token, min_shares_out)` buys shares with
  collateral.
- `sell_shares(trader, side, shares_in, token, min_amount_out)` sells held
  shares for collateral. `shares_in` and `min_amount_out` use the shared
  seven-decimal scale for shares and the token's native units for collateral.
- `claim_amm_shares(trader, token)` settles a trader's AMM position after
  resolution, or refunds positive net collateral after cancellation.
- `get_amm_odds(side, amount)` quotes a buy without changing pool state.
- `get_amm_sell_quote(side, shares_in)` quotes a sell without changing pool state.
- `get_amm_pool()` returns `(reserve_a, reserve_b, reserve_draw, collateral,
  outstanding_shares, lp_shares)`.
- `get_amm_position(trader)` returns held share balances in A, B, Draw order.

Amounts passed for token transfers use the market token's native precision.
AMM quotes, pool data, shares, and returned settlement amounts use the
contracts' shared seven-decimal calculation scale. `get_amm_odds` returns
`(shares_out, price_impact_bps)`; `get_amm_sell_quote` returns
`(collateral_out, price_impact_bps)`. Both return `(0, 0)` until the pool is
seeded.

## Arbitrage and limits

The AMM has no external price feed. Its prices move with pool composition, so
traders can buy or sell when the pool price differs from another market or
venue; those trades push pool prices toward the external price. The contract
does not implement automated rebalancing, governance, or LP incentives.

`compute_odds` and `compute_sell_quote` are shared pure math functions. They
reject invalid reserves, sides, zero-sized trades, and arithmetic overflow.
Market-tier slippage limits and caller-provided minimum outputs protect trade
execution. A quote is informational; the transaction re-computes it against
the current reserves before applying the trade.

## Tests

`contracts/shared/src/amm.rs` tests all outcome sides, reserve-dependent
pricing, price impact, reverse sell quotes, invariant-preserving rounding,
invalid inputs, overflow, and tier slippage behavior.
