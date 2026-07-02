ALTER TABLE trades ADD COLUMN IF NOT EXISTS policy_version VARCHAR(80) NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS opportunity_cycle_id CHAR(36) NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS score_trace LONGTEXT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sizing_trace LONGTEXT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_policy_opened ON trades (policy_version, opened_at);
