"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { CATEGORIES } = require("./indicators");
function load(
  file = process.env.STRATEGY_POLICY_PATH ||
    path.join(__dirname, "../../config/strategy-v2.json"),
) {
  const p = JSON.parse(fs.readFileSync(file));
  if (
    p.schema !== 1 ||
    !["research", "shadow", "enforce"].includes(p.mode) ||
    !Number.isFinite(p.riskFraction) ||
    p.riskFraction <= 0 ||
    p.riskFraction > 0.02 ||
    !Number.isFinite(p.maxPortfolioRisk) ||
    p.maxPortfolioRisk < p.riskFraction ||
    p.maxPortfolioRisk > 0.1 ||
    !Number.isFinite(p.maxMarginFractionPerPosition ?? 0.9) ||
    (p.maxMarginFractionPerPosition ?? 0.9) <= 0 ||
    (p.maxMarginFractionPerPosition ?? 0.9) > 0.9 ||
    !Number.isFinite(p.maxTotalMarginFraction ?? 0.9) ||
    (p.maxTotalMarginFraction ?? 0.9) < (p.maxMarginFractionPerPosition ?? 0.9) ||
    (p.maxTotalMarginFraction ?? 0.9) > 0.9 ||
    !Number.isInteger(p.minLeverage ?? 1) ||
    !Number.isInteger(p.maxLeverage ?? 10) ||
    (p.minLeverage ?? 1) < 1 ||
    (p.maxLeverage ?? 10) > 10 ||
    (p.minLeverage ?? 1) > (p.maxLeverage ?? 10) ||
    !Number.isInteger(p.maxPositions) ||
    p.maxPositions < 1 ||
    p.maxPositions > 10 ||
    !Number.isFinite(p.maxDrawdown) ||
    p.maxDrawdown <= 0 ||
    p.maxDrawdown > 0.3 ||
    !Number.isInteger(p.maxLossStreak) ||
    p.maxLossStreak < 2 ||
    !["1h", "4h"].includes(p.timeframe) ||
    ![0.8, 1, 1.2].includes(p.scale) ||
    !["pair", "consensus10"].includes(p.entryMode ?? "pair") ||
    !Number.isInteger(p.minVotes ?? 5) ||
    (p.minVotes ?? 5) < 5 ||
    (p.minVotes ?? 5) > 8 ||
    !Number.isFinite(p.depthNotionalMultiple ?? 5) ||
    (p.depthNotionalMultiple ?? 5) < 1 ||
    (p.depthNotionalMultiple ?? 5) > 20 ||
    !Number.isFinite(p.adxThreshold ?? 25) ||
    (p.adxThreshold ?? 25) < 10 ||
    (p.adxThreshold ?? 25) > 40 ||
    !Number.isFinite(p.bollingerSigma ?? 2) ||
    (p.bollingerSigma ?? 2) < 1 ||
    (p.bollingerSigma ?? 2) > 3 ||
    !Number.isFinite(p.minExpectedR ?? 0) ||
    (p.minExpectedR ?? 0) < 0 ||
    (p.minExpectedR ?? 0) > 5 ||
    !Array.isArray(p.directions) ||
    !p.directions.length ||
    p.directions.some((s) => !["LONG", "SHORT"].includes(s)) ||
    ![
      "feeRate",
      "slippageBps",
      "fundingReserve",
      "minQuoteVolume",
      "minDepthQuote",
      "maxSpreadBps",
      "maxAtrFraction",
    ].every((k) => Number.isFinite(p[k]) && p[k] >= 0)
  )
    throw Error("STRATEGY_POLICY_INVALID");
  if (
    p.pair !== null &&
    (!Array.isArray(p.pair) ||
      p.pair.length !== 2 ||
      p.pair[0] === p.pair[1] ||
      p.pair.some((k) => !CATEGORIES[k]))
  )
    throw Error("EXACTLY_TWO_INDICATORS_REQUIRED");
  return p;
}
function promotion(p, report) {
  const reasons = [];
  if (
    p.management !== "existing" ||
    report?.selected?.management !== p.management
  )
    reasons.push("UNVALIDATED_POSITION_MANAGEMENT");
  if (!p.pair) reasons.push("NO_SELECTED_PAIR");
  if (
    !report?.selected ||
    report?.promotion?.allowed !== true ||
    report.reportId !== p.promotion?.reportId
  )
    reasons.push("NO_APPROVED_REPORT");
  if (
    JSON.stringify(p.pair) !== JSON.stringify(report?.selected?.pair) ||
    p.timeframe !== report?.selected?.timeframe ||
    p.scale !== report?.selected?.scale ||
    JSON.stringify(p.directions) !==
      JSON.stringify(report?.selected?.directions)
  )
    reasons.push("POLICY_REPORT_MISMATCH");
  if (
    report?.jevValidation?.passed !== true ||
    report?.executionValidation?.passed !== true
  )
    reasons.push("LIVE_PATH_UNVALIDATED");
  if (
    !(
      report?.outOfSample?.acceptance?.passed &&
      report?.walkForward?.positive &&
      report?.monteCarlo?.p95Drawdown < p.maxDrawdown
    )
  )
    reasons.push("ROBUSTNESS_REJECTED");
  // An explicit operator activation is separate from quantitative approval.
  // Bind it to the exact diagnostic candidate and report; never clear failures.
  const manual = p.manualActivation;
  const candidate = report?.frozenCandidate;
  const manualCandidate = manual?.overrideCandidate || candidate;
  const manualAllowed = manual?.enabled === true &&
    manual.reportId === report?.reportId && typeof report?.reportId === 'string' &&
    typeof manual.reason === 'string' && manual.reason.trim().length > 0 &&
    Number.isFinite(Date.parse(manual.authorizedAt)) &&
    p.management === 'existing' && manualCandidate?.management === 'existing' &&
    JSON.stringify(p.pair) === JSON.stringify(manualCandidate?.pair) &&
    p.timeframe === manualCandidate?.timeframe && p.scale === manualCandidate?.scale &&
    JSON.stringify(p.directions) === JSON.stringify(manualCandidate?.directions) &&
    (p.adxThreshold ?? 25) === (manualCandidate?.adxThreshold ?? 25) &&
    (p.bollingerSigma ?? 2) === (manualCandidate?.bollingerSigma ?? 2) &&
    (p.minExpectedR ?? 0) === (manualCandidate?.minExpectedR ?? 0);
  const manualSettingsMatch =
    (p.entryMode ?? "pair") === (manualCandidate?.entryMode ?? "pair") &&
    (p.minVotes ?? 5) === (manualCandidate?.minVotes ?? 5) &&
    p.minDepthQuote === (manualCandidate?.minDepthQuote ?? p.minDepthQuote) &&
    (p.depthNotionalMultiple ?? 5) === (manualCandidate?.depthNotionalMultiple ?? 5);
  return { allowed: !reasons.length || (manualAllowed && manualSettingsMatch), reasons,
    validationPassed: !reasons.length,
    activation: manualAllowed && manualSettingsMatch ? 'MANUAL_UNVALIDATED' : !reasons.length ? 'VALIDATED' : 'BLOCKED' };
}
module.exports = { load, promotion };
