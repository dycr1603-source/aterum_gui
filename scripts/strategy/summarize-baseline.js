"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto"),
  { account } = require("../../services/strategy/feedback"),
  { metrics, breakdown } = require("../../services/strategy/metrics");
const root = path.resolve(__dirname, "../../.local/strategy-v2"),
  base = JSON.parse(fs.readFileSync(path.join(root, "baseline.json"))),
  costs = JSON.parse(fs.readFileSync(path.join(root, "baseline-costs.json"))),
  parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
const fundingHistory = new Map(
  manifest.datasets
    .filter((d) => d.purpose === "comparison")
    .map((d) => [
      d.symbol,
      JSON.parse(fs.readFileSync(path.join(root, d.file))).funding,
    ]),
);
const audited = [];
for (const t of base.trades) {
  const evidence = costs.find((c) => c.id === t.id);
  let accounting = {
    accountingComplete: false,
    accountingReason: evidence?.error
      ? "EXCHANGE_RATE_LIMIT_OR_API_ERROR"
      : "MISSING_EXCHANGE_LEDGER",
  };
  const execution = base.executions.find(
      (e) => e.execution_id === t.execution_id,
    ),
    request = execution ? parse(execution.request_payload) : null;
  const decisionId = request?.tradeContext?.jev?.id,
    decision = base.decisions.find((d) => d.id === decisionId),
    jev = decision ? parse(decision.result) : null;
  if (evidence && !evidence.error)
    accounting = account({
      fundingCoverageVerified: (() => {
        const linked = evidence.fills.filter(
          (f) => String(f.orderId) === String(t.market_order_id),
        );
        const first = linked.length
          ? Math.min(...linked.map((f) => Number(f.time)))
          : Date.parse(t.opened_at);
        const history = fundingHistory.get(t.symbol);
        return (
          first >= Date.parse(t.opened_at) - 60000 ||
          (!!history &&
            !history.some(
              (f) =>
                f.time >= first && f.time < Date.parse(t.opened_at) - 60000,
            ))
        );
      })(),
      fills: evidence.fills,
      funding: evidence.funding,
      side: t.direction,
      quantity: Number(
        execution
          ? (parse(execution.verification_result)?.after?.position?.qty ??
              t.qty)
          : t.qty,
      ),
      entryTime: Date.parse(t.opened_at) - 60000,
      exitTime: Date.parse(t.closed_at) + 999,
      entryOrderId: t.market_order_id,
      hedged: base.trades.some(
        (x) =>
          x.id !== t.id &&
          x.symbol === t.symbol &&
          x.direction !== t.direction &&
          Date.parse(x.opened_at) <= Date.parse(t.closed_at) &&
          Date.parse(x.closed_at) >= Date.parse(t.opened_at),
      ),
    });
  const risk = Number(request?.tradeContext?.maxLoss || t.max_loss);
  audited.push({
    ...accounting,
    id: t.id,
    symbol: t.symbol,
    side: t.direction,
    confidence: Number.isFinite(jev?.answer?.confidence)
      ? jev.answer.confidence * 100
      : null,
    leverage: Number(t.leverage),
    regime: t.ai_regime,
    timeframe: "1h",
    entryTime: Date.parse(t.opened_at),
    exitTime: Date.parse(t.closed_at),
    r: accounting.accountingComplete && risk > 0 ? accounting.net / risk : null,
  });
}
const complete = audited.filter((t) => t.accountingComplete),
  reportFile = path.resolve(__dirname, "../../docs/strategy/results.json"),
  report = JSON.parse(fs.readFileSync(reportFile));
report.recordedPerformance = {
  capturedAt: base.capturedAt,
  total: audited.length,
  audited: complete.length,
  accountingPending: audited.length - complete.length,
  metrics: metrics(
    complete,
    report.policy.initialCapital,
    null,
    Math.min(...audited.map((t) => t.entryTime)),
    Math.max(...audited.map((t) => t.exitTime)),
  ),
  breakdown: breakdown(complete, report.policy.initialCapital),
  coverage: audited.map(
    ({ id, symbol, accountingComplete, accountingReason }) => ({
      id,
      symbol,
      accountingComplete,
      accountingReason,
    }),
  ),
  limitations: [
    "Only fully attributed Binance fills in USDT and non-ambiguous funding enter net metrics",
    "Historical equity is not reconstructed; drawdown uses report reference capital and close sequence",
    "Confidence/leverage buckets are observational, uncalibrated and subject to small samples",
  ],
};
report.jevCalibration =
  require("../../services/strategy/calibration").calibrate(audited);
delete report.reportId;
report.reportId = createHash("sha256")
  .update(JSON.stringify(report))
  .digest("hex");
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(root, "audited-trades.json"),
  JSON.stringify(audited, null, 2),
);
console.log(
  JSON.stringify(
    {
      audited: complete.length,
      pending: audited.length - complete.length,
      net: report.recordedPerformance.metrics.netProfit,
      jev: report.recordedPerformance.breakdown.confidence,
    },
    null,
    2,
  ),
);
