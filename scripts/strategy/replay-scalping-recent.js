"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { prepare, run } = require("../../services/strategy/backtest");
const { inputs } = require("../../services/strategy/scalp_model");
const { contentHash } = require("./download");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const history = JSON.parse(fs.readFileSync(path.join(root, "scalping-six-month-manifest.json")));
const recent = JSON.parse(fs.readFileSync(path.join(root, "scalping-recent-manifest.json")));
if (recent.datasets.length !== 12 || recent.rejected.length)
  throw Error("RECENT_SCALPING_HISTORY_INCOMPLETE");
const oldBySymbol = new Map(history.datasets.map(x => [x.symbol, x]));
const data = recent.datasets.map(x => {
  const old = JSON.parse(fs.readFileSync(path.join(root, oldBySymbol.get(x.symbol).file)));
  const fresh = JSON.parse(fs.readFileSync(path.join(root, x.file)));
  if (contentHash(old) !== old.contentHash || contentHash(fresh) !== x.contentHash)
    throw Error(`RECENT_CHECKSUM_${x.symbol}`);
  const prior = old.bars.slice(-240), start = prior[0].time;
  const dataset = { symbol: x.symbol, timeframe: "5m", intervalMs: 300000,
    start, end: recent.end, bars: [...prior, ...fresh.bars],
    funding: [...old.funding.filter(f => f.time >= start), ...fresh.funding] };
  const p = prepare(dataset, .8, { adxThreshold: 22, bollingerSigma: 1.8 });
  p.scalpInputs = inputs(p.bars, p.features);
  return p;
});
const policy = { ...require("../../config/strategy-scalp-candidate.json"),
  initialCapital: 1000, latencyBars: 0 };
const research = JSON.parse(fs.readFileSync(path.join(root,
  "scalping-six-month-results-extended.json")));
const liveCandidate = require("../../config/strategy-scalp-candidate.json");
const candidates = [{ label: "shadow-candidate", entry: liveCandidate.scalp,
  exit: liveCandidate.scalp, management: liveCandidate.management },
  ...research.top.map(x => ({ label: x.entry.model, entry: x.entry,
    exit: x.exit, management: x.management }))];
function evaluate(candidate, overrides = {}) {
  const fast = { stopAtr: candidate.exit.stopAtr, targetR: candidate.exit.targetR,
    maxHours: candidate.exit.maxBars / 12, structureBars: 6,
    minNetR: 1.1, reversal: 0, earlyLoss: false, staleHours: 0 };
  const r = run(data, { policy: { ...policy, ...overrides },
    start: recent.start, end: recent.end, entryMode: "scalp",
    scalp: candidate.entry, management: candidate.management, fast,
    directions: ["LONG", "SHORT"], leverage: 5,
    maxMarginFractionPerPosition: .35 });
  const durations = r.trades.map(t => (t.exitTime-t.entryTime)/60000).sort((a,b)=>a-b);
  return { ...r.metrics, meanMinutes: durations.length ?
    durations.reduce((a,b)=>a+b,0)/durations.length : null,
    medianMinutes: durations.length ? durations[Math.floor(durations.length/2)] : null,
    halted: r.halted };
}
const rows = candidates.map(x => ({ candidate: x, base: evaluate(x),
  stress: evaluate(x, { feeRate: .001, slippageBps: 10, spreadBps: 4 }) }));
const out = { schema: 1, generatedAt: new Date().toISOString(),
  interval: [recent.start, recent.end], rows };
fs.writeFileSync(path.join(root, "scalping-recent-results.json"),
  JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(rows.map(x => ({ label: x.candidate.label,
  net: x.base.netProfit, pf: x.base.profitFactor,
  dd: x.base.maxDrawdown, trades: x.base.trades,
  meanMinutes: x.base.meanMinutes, stressNet: x.stress.netProfit })), null, 2));
