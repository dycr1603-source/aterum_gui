# Fast strategy candidate — 2026-10-10

Status: **implemented locally, not activated**. `config/strategy-v2.json` has `manualActivation.enabled=false`. The current running containers and n8n database have not been changed by this candidate.

The candidate selects a 1h consensus signal, passes the ranked opportunity and 5m momentum/volume/volatility to JEV, and derives SL/TP from recent closed 5m bars. It can open up to three positions sequentially, only after Binance verification of each prior order. Margin caps total initial margin at 90% of real equity with a 10% reserve; risk, exchange lot rules, maintenance margin and execution verification remain enforced. The trailing workflow considers a six-hour maximum, adverse momentum, stale loss and profit reversal, with verified close requests per position.

## Historical diagnostic

Command: `docker compose exec -T dashboard node - < scripts/strategy/replay-recent-fast-exits.js`

The diagnostic replays **10** recent recorded entries (opened from 2026-10-05; a position lasting under five minutes is excluded) against Binance public 5m candles. It assumes 0.1% fee per side, 5 bps adverse exit slippage and a 0.1% funding reserve. It gives a stop priority when both stop and target are touched in one candle. It reuses the recorded entry, side and quantity, then calculates a counterfactual 5m stop; it does **not** reproduce JEV's entry selection, live order fill or actual funding.

| Scenario | Net result under common cost assumptions | Win rate | Median hold |
| --- | ---: | ---: | ---: |
| Recorded exits | −2.71 USDT | 50% | 1,198 min |
| Old stop with fast exit | −8.43 USDT | 10% | 184 min |
| 5m stop with fast exit | −5.52 USDT | 20% | 52 min |

This sample supports faster exits but **does not support higher net profit**. In particular, five of ten positions with 5m stops hit their stop and five exited on reversal; none reached the candidate TP in this replay. The broader [historical research](FAST_RESEARCH_2026-10-10.md) subsequently tested all 61 bot entries and 482 full technical configurations. It found no robust profitable configuration and did not promote this candidate for production activation.

Checks: `npm run build`, `npm run test:strategy`, `npm run test:workflow`, `npm run test:execution`, and `npm run test:offline` pass. These establish code contracts and fail-closed behavior, not a trading edge.
