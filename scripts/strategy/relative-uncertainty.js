"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { run } = require("../../services/strategy/backtest");
const { data, policy, periods, signals } = require("./relative-research");
const candidate = require("../../config/strategy-relative-candidate.json").relative;
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const day = 86400000;
function simulate(period) {
  return run(data, { policy, start: period[0], end: period[1],
    entrySignalsBySymbol: signals(candidate),
    fast: { stopAtr: candidate.stopAtr, targetR: candidate.targetR,
      maxHours: candidate.maxHours, structureBars: 12, minNetR: 1.1,
      reversal: 0, earlyLoss: false, staleHours: 0 },
    management: "fixed", leverage: 5, maxMarginFractionPerPosition: .35,
    directions: ["LONG", "SHORT"] });
}
function weeklyBootstrap(trades, period, iterations = 10000) {
  const weeks = Math.ceil((period[1] - period[0]) / (7 * day));
  const blocks = Array(weeks).fill(0);
  for (const t of trades) {
    const i = Math.floor((t.entryTime - period[0]) / (7 * day));
    if (i >= 0 && i < weeks) blocks[i] += t.net;
  }
  let seed = 20261010;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const totals = [];
  for (let k = 0; k < iterations; k++) {
    let sum = 0;
    for (let i = 0; i < weeks; i++) sum += blocks[Math.floor(random() * weeks)];
    totals.push(sum);
  }
  totals.sort((a, b) => a - b);
  return { weeks, pointNet: blocks.reduce((a, b) => a + b, 0),
    lower95: totals[Math.floor(.025 * iterations)],
    upper95: totals[Math.floor(.975 * iterations)],
    positiveFraction: totals.filter(x => x > 0).length / iterations,
    note: "Exploratory block bootstrap; historical selection and serial dependence limit interpretation." };
}
const output = {};
for (const [name, period] of Object.entries(periods)) {
  const r = simulate(period);
  output[name] = { metrics: r.metrics, count: r.trades.length,
    bootstrap: weeklyBootstrap(r.trades, period),
    trades: r.trades.map(t => ({ symbol: t.symbol, side: t.side,
      entryTime: t.entryTime, exitTime: t.exitTime,
      net: t.net, exitReason: t.exitReason })) };
}
fs.writeFileSync(path.join(root, "relative-uncertainty.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), candidate, output }, null, 2) + "\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(output)
  .map(([name, x]) => [name, { count: x.count,
    net: x.metrics.netProfit, pf: x.metrics.profitFactor,
    bootstrap: x.bootstrap }])), null, 2));
