CREATE TABLE IF NOT EXISTS research_shadow_evaluations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(24) NULL,
  setup_key VARCHAR(255) NULL,
  session_key VARCHAR(16) NULL,
  regime_key VARCHAR(40) NULL,
  source_recommendation_ids LONGTEXT NULL,
  production_score DECIMAL(9,4) NOT NULL,
  shadow_score DECIMAL(9,4) NOT NULL,
  threshold_score DECIMAL(9,4) NOT NULL,
  production_allowed TINYINT(1) NOT NULL,
  shadow_allowed TINYINT(1) NOT NULL,
  production_delta DECIMAL(9,4) NOT NULL,
  shadow_delta DECIMAL(9,4) NOT NULL,
  marginal_delta DECIMAL(9,4) NOT NULL,
  context LONGTEXT NULL,
  dry_run TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  INDEX idx_research_shadow_created (created_at),
  INDEX idx_research_shadow_symbol (symbol,created_at),
  INDEX idx_research_shadow_changed (production_allowed,shadow_allowed,created_at)
);

ALTER TABLE market_opportunities ADD COLUMN IF NOT EXISTS research_shadow_delta DECIMAL(8,3) NULL;
ALTER TABLE market_opportunities ADD COLUMN IF NOT EXISTS research_shadow_score DECIMAL(8,3) NULL;
ALTER TABLE market_opportunities ADD COLUMN IF NOT EXISTS research_shadow_would_change TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE research_shadow_evaluations ADD COLUMN IF NOT EXISTS dry_run TINYINT(1) NOT NULL DEFAULT 0;

UPDATE ai_recommendations
SET implementation_status='shadow', implemented_at=NULL,
    implementation_reason='Hipótesis Research aislada de producción; pendiente de validación fuera de muestra'
WHERE implementation_status='implementada';
