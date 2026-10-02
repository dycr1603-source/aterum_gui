# Entry quality rollout — 2026-10-02

Local audit: last 20 closes in Delcon's DB had 4 positive PNL and aggregate reported PNL -14.298641 USDT. This is not a consolidated exchange ledger: Saitama trade rows are independent and Telegram archive sync does not merge trades. Reported PNL is not asserted to include every commission/funding payment.

Authentic TypeSafe calls returned jev-1.13.0. A three-snapshot historical audit without trade outcomes selected weak volume (0.85 choice probability); a separate engineering risk review selected validation/exposure limits. These are model opinions, not calibrated probabilities of profit or out-of-sample evidence. An initial larger request returned HTTP 400; smaller calls succeeded. No order endpoint was called by the audit.

`JEV_ENTRY_QUALITY_ENABLED=true` is the Compose default for Dashboard. The policy in `services/jev_entry_quality.js` adds conservative, provisional entry limits:

- Maximum two existing positions before skipping analysis; existing positions stay managed.
- Missing ATR/EMA21/volume/position-list data rejects entry. Volume below 0.8x rejects before TypeSafe.
- Directional price extension beyond 2 ATR from EMA21 excludes that direction; never automatically reverses it.
- Chosen direction requires confidence >=0.60 and probability margin >=0.20. These indicate model ambiguity, not expected profitability.
- Chosen TP/SL require net reward/risk >=1.20 with entry/exit fees (at least 0.1% per side). The check precedes the second leverage call. Funding/slippage remain additional costs; this ratio is not expected value.

No changes to position sizing, leverage ceilings, live stops, exits or trailing. Existing executor monetary controls remain authoritative. Gate result persists version, policy, metrics and rejection reason. Thresholds are conservative engineering choices, not optimized or proven profitable. It can reject winners as well as losers. Do not increase exposure on the strength of this in-sample audit. Evaluate subsequent net outcomes, rejection counts, drawdown and concurrent exposure before considering any expansion.

Rollback: set JEV_ENTRY_QUALITY_ENABLED=false and recreate Dashboard (coordinate n8n because it shares Dashboard networking). This restores prior entry acceptance; it does not undo any orders. No credentials belong in this document.

Verification: 53 Jev/entry-quality/delivery tests passed, GUI build and image build passed. Replay of 21 stored proposals: 3 pass the new screens; rejection categories overlap (15 concentration, 7 volume, 3 ambiguity, 2 net R:R, 2 extension). This is a policy replay, not a backtest: it does not recompute the path-dependent portfolio or prove avoided losses. Deployed in Delcon Dashboard with JEV_ENTRY_QUALITY_ENABLED=true; Jev remains enforce mode. n8n was stopped gracefully for its shared-network recreation; Position Guard and exit monitors were not edited. No audit order was submitted.
