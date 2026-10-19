# Smart Contract Architecture

The contracts are a Soroban workspace. The factory deploys one market contract per
event, each market owns its betting and settlement state, and the treasury holds
and accounts for collected fees. Shared types, AMM calculations, and event helpers
are kept in `shared` so the contracts use the same serialized data and rules.

## Contract boundaries

| Crate | Responsibility | Main state |
| --- | --- | --- |
| `market_factory` | Initializes the platform, deploys markets, indexes their IDs and addresses, manages oracle keys and factory administration. | Admin and pending admin, market map, open-market IDs, oracle whitelist, default configuration and market Wasm hash. |
| `market` | Accepts bets, manages liquidity, locks and resolves a match, and processes winnings or cancellation refunds. | Match configuration and status, outcome, outcome pools, bettor positions, oracle reports, and LP positions. |
| `treasury` | Accepts fees from approved markets and provides controlled fee withdrawal and audit facilities. | Supported tokens and markets, balances, per-transaction and daily caps, pause state, fee schedule and audit log. |
| `shared` | Defines cross-contract data types and errors; supplies AMM/math functions, event emitters and event parsers. | No contract storage; reusable code and serialized interfaces only. |

## Market lifecycle

1. The factory admin initializes the factory and sets the market Wasm hash.
   An authorized caller creates a market; the factory validates the match and
   configuration, deploys the contract using the market ID as its salt, initializes
   it, and indexes it as open.
2. Bettors place authorized bets while the market is open and before its configured
   lock time. Each bet updates that bettor's position and the selected outcome pool.
   The market applies AMM pricing/slippage checks when all pools are initialized.
3. At lock time, the market stops taking bets. Whitelisted oracles submit signed
   reports; the market verifies each signature against the public key registered by
   the factory and requires the configured consensus threshold.
4. Consensus moves the market into `ResolutionPending` and starts a dispute
   cooldown. After the cooldown, resolution can be finalized, or an authorized
   dispute can change the outcome. This separates report consensus from payout
   eligibility.
5. Winners claim their pro-rata share of the net pool. Cancelled markets instead
   let bettors claim their unclaimed stakes as refunds. A market notifies the
   factory when it is terminal so it can be removed from the open-market index.

## Funds and trust boundaries

- Fund-moving market and treasury operations authenticate the relevant caller,
  validate state and limits, persist effects, and only then make token transfers
  (checks-effects-interactions). Claim/refund paths also use a reentrancy lock.
- The factory owns the market registry and oracle whitelist. Markets read oracle
  membership and raw Ed25519 keys from the factory rather than trusting keys
  supplied in a report.
- Markets deposit fees into the treasury. Only approved markets and supported
  tokens may deposit; admin withdrawals are protected by pause controls, caps,
  reentrancy protection and an append-only audit record.
- Factory and treasury administration is explicit. Factory admin transfer uses
  proposal and acceptance; contract upgrades require the configured admin.

## Shared interfaces and events

The `shared` crate is the canonical source for serializable market/configuration
types, error codes and event payloads. Event parsers convert raw Soroban topics
and data into typed records and return `ParseError` for malformed payloads.
AMM helpers operate on stroops and return `Option` when inputs or checked
arithmetic cannot produce a valid quote.

## Documentation and verification

From this directory, generate the workspace API docs and check that every
production public function has a rustdoc summary:

```sh
RUSTDOCFLAGS="-D rustdoc::broken_intra_doc_links" cargo doc --workspace --no-deps
python3 scripts/check_rustdoc.py
```

Both checks run in the contracts CI workflow.
