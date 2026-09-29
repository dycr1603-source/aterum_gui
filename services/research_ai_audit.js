'use strict';

const shared = require('../shared');

async function ensureTable() {
  await shared.db.execute(`CREATE TABLE IF NOT EXISTS research_ai_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    execution_id VARCHAR(80) NOT NULL,
    analysis_type VARCHAR(16) NOT NULL,
    status VARCHAR(32) NOT NULL,
    reason_code VARCHAR(64) NULL,
    model VARCHAR(100) NOT NULL,
    max_output_tokens INT NOT NULL DEFAULT 0,
    input_tokens INT NULL,
    output_tokens INT NULL,
    estimated_input_tokens_saved INT NULL,
    estimated_output_tokens_saved INT NULL,
    account_equity DECIMAL(20,8) NULL,
    available_margin DECIMAL(20,8) NULL,
    remaining_margin DECIMAL(20,8) NULL,
    margin_usage_pct DECIMAL(10,4) NULL,
    open_risk_pct DECIMAL(10,4) NULL,
    remaining_risk_pct DECIMAL(10,4) NULL,
    max_risk_pct DECIMAL(10,4) NULL,
    max_margin_usage_pct DECIMAL(10,4) NULL,
    open_positions INT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
    UNIQUE KEY uq_research_ai_run (execution_id,analysis_type),
    INDEX idx_research_ai_created (created_at),
    INDEX idx_research_ai_status_created (status,created_at)
  )`);
}

const fields = [
  'execution_id','analysis_type','status','reason_code','model','max_output_tokens',
  'input_tokens','output_tokens','estimated_input_tokens_saved','estimated_output_tokens_saved',
  'account_equity','available_margin','remaining_margin','margin_usage_pct','open_risk_pct',
  'remaining_risk_pct','max_risk_pct','max_margin_usage_pct','open_positions'
];

async function recordRun(input) {
  await ensureTable();
  const values = fields.map(key => input[key] == null ? null : input[key]);
  await shared.db.execute(`INSERT INTO research_ai_runs (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})
    ON DUPLICATE KEY UPDATE status=VALUES(status),reason_code=VALUES(reason_code),input_tokens=VALUES(input_tokens),
    output_tokens=VALUES(output_tokens),estimated_input_tokens_saved=VALUES(estimated_input_tokens_saved),
    estimated_output_tokens_saved=VALUES(estimated_output_tokens_saved),account_equity=VALUES(account_equity),
    available_margin=VALUES(available_margin),remaining_margin=VALUES(remaining_margin),margin_usage_pct=VALUES(margin_usage_pct),
    open_risk_pct=VALUES(open_risk_pct),remaining_risk_pct=VALUES(remaining_risk_pct),max_risk_pct=VALUES(max_risk_pct),
    max_margin_usage_pct=VALUES(max_margin_usage_pct),open_positions=VALUES(open_positions)`, values);
}

async function getSummary() {
  await ensureTable();
  const [[totals]] = await shared.db.execute(`SELECT COUNT(*) AS totalRuns,
    SUM(status='COMPLETED') AS completed,
    SUM(status LIKE 'SKIPPED%') AS skipped,
    SUM(status='FAILED') AS failed,
    SUM(COALESCE(input_tokens,0)) AS inputTokens,
    SUM(COALESCE(output_tokens,0)) AS outputTokens,
    SUM(COALESCE(estimated_input_tokens_saved,0)) AS estimatedInputTokensSaved,
    SUM(COALESCE(estimated_output_tokens_saved,0)) AS estimatedOutputTokensSaved,
    MAX(created_at) AS lastRun
    FROM research_ai_runs WHERE created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY)`);
  const [byType] = await shared.db.execute(`SELECT analysis_type AS analysisType,status,COUNT(*) AS runs,
    SUM(COALESCE(input_tokens,0)) AS inputTokens,SUM(COALESCE(output_tokens,0)) AS outputTokens,
    SUM(COALESCE(estimated_input_tokens_saved,0)) AS estimatedInputTokensSaved,
    SUM(COALESCE(estimated_output_tokens_saved,0)) AS estimatedOutputTokensSaved
    FROM research_ai_runs WHERE created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY)
    GROUP BY analysis_type,status ORDER BY analysis_type,status`);
  const [recent] = await shared.db.execute(`SELECT analysis_type AS analysisType,status,reason_code AS reasonCode,model,
    max_output_tokens AS maxOutputTokens,input_tokens AS inputTokens,output_tokens AS outputTokens,
    estimated_input_tokens_saved AS estimatedInputTokensSaved,estimated_output_tokens_saved AS estimatedOutputTokensSaved,
    account_equity AS accountEquity,available_margin AS availableMargin,remaining_margin AS remainingMargin,
    margin_usage_pct AS marginUsagePct,open_risk_pct AS openRiskPct,remaining_risk_pct AS remainingRiskPct,
    max_risk_pct AS maxRiskPct,max_margin_usage_pct AS maxMarginUsagePct,open_positions AS openPositions,created_at AS createdAt
    FROM research_ai_runs ORDER BY created_at DESC LIMIT 100`);
  return { periodDays: 90, totals: totals || {}, byType: byType || [], recent: recent || [] };
}

async function getInputEstimate(analysisType) {
  await ensureTable();
  const [[row]] = await shared.db.execute(`SELECT ROUND(AVG(input_tokens)) AS averageInputTokens,COUNT(*) AS samples
    FROM research_ai_runs WHERE analysis_type=? AND status='COMPLETED' AND input_tokens IS NOT NULL
      AND created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY)`, [analysisType]);
  return { averageInputTokens: row?.samples ? Number(row.averageInputTokens) : null,
    samples: Number(row?.samples || 0) };
}

module.exports = { ensureTable, recordRun, getSummary, getInputEstimate };
