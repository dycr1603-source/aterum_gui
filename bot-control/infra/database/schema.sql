CREATE DATABASE IF NOT EXISTS trading_bot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE trading_bot;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(24) NOT NULL,
  direction ENUM('LONG','SHORT','NEUTRAL') NULL,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  entry_price DECIMAL(24,10) NULL,
  sl_price DECIMAL(24,10) NULL,
  tp_price DECIMAL(24,10) NULL,
  qty DECIMAL(24,10) NULL,
  leverage DECIMAL(10,2) NULL,
  margin DECIMAL(18,6) NULL,
  risk_pct DECIMAL(8,4) NULL,
  max_loss DECIMAL(18,6) NULL,
  max_gain DECIMAL(18,6) NULL,
  rr_ratio DECIMAL(10,4) NULL,
  final_score DECIMAL(8,3) NULL,
  scan_score DECIMAL(8,3) NULL,
  ai_regime VARCHAR(32) NULL,
  ai_bias VARCHAR(16) NULL,
  ai_reasoning TEXT NULL,
  ai_key_risk TEXT NULL,
  recommended_leverage DECIMAL(10,2) NULL,
  vision_state VARCHAR(32) NULL,
  vision_approved TINYINT(1) DEFAULT 0,
  vision_reason TEXT NULL,
  used_fallback TINYINT(1) DEFAULT 0,
  original_symbol VARCHAR(24) NULL,
  market_order_id VARCHAR(64) NULL,
  tp_order_id VARCHAR(64) NULL,
  sl_monitor TINYINT(1) DEFAULT 0,
  tf4h_trend VARCHAR(10) NULL,
  tf4h_status VARCHAR(15) NULL,
  tf4h_rsi DECIMAL(6,2) NULL,
  macro_bias VARCHAR(10) NULL,
  macro_fear_greed INT NULL,
  macro_btc_change DECIMAL(8,3) NULL,
  macro_size_mult DECIMAL(6,3) NULL,
  score_multiplier DECIMAL(6,3) NULL,
  effective_risk_pct DECIMAL(8,4) NULL,
  rsi14 DECIMAL(8,3) NULL,
  atr_pct DECIMAL(10,4) NULL,
  vol_ratio DECIMAL(10,4) NULL,
  funding_rate DECIMAL(12,8) NULL,
  vwap DECIMAL(24,10) NULL,
  current_price DECIMAL(24,10) NULL,
  dynamic_threshold DECIMAL(8,3) NULL,
  entry_reason TEXT NULL,
  setup_label VARCHAR(120) NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_trades_symbol_status (symbol, status),
  INDEX idx_trades_opened_at (opened_at),
  INDEX idx_trades_status_opened (status, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trade_closes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trade_id INT NOT NULL,
  symbol VARCHAR(24) NOT NULL,
  exit_price DECIMAL(24,10) NULL,
  pnl_usdt DECIMAL(18,6) NULL,
  pnl_pct DECIMAL(12,6) NULL,
  r_final DECIMAL(10,4) NULL,
  close_reason ENUM('SL','TP','MANUAL','SYNC','TIME_EXIT') NOT NULL DEFAULT 'MANUAL',
  trailing_stage ENUM('INITIAL','BREAKEVEN','TIME_LOCK','LOCK','TRAILING') NOT NULL DEFAULT 'INITIAL',
  duration_minutes INT NULL,
  closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trade_closes_trade_id (trade_id),
  INDEX idx_trade_closes_symbol (symbol),
  INDEX idx_trade_closes_closed_at (closed_at),
  CONSTRAINT fk_trade_closes_trade
    FOREIGN KEY (trade_id) REFERENCES trades(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trade_rejections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(24) NULL,
  direction ENUM('LONG','SHORT','NEUTRAL') NULL,
  skip_reason TEXT NULL,
  final_score DECIMAL(8,3) NULL,
  scan_score DECIMAL(8,3) NULL,
  ai_regime VARCHAR(32) NULL,
  ai_bias VARCHAR(16) NULL,
  vision_state VARCHAR(32) NULL,
  vision_approved TINYINT(1) DEFAULT 0,
  rsi14 DECIMAL(8,3) NULL,
  atr_pct DECIMAL(10,4) NULL,
  vol_ratio DECIMAL(10,4) NULL,
  funding_rate DECIMAL(12,8) NULL,
  tf4h_status VARCHAR(15) NULL,
  macro_bias VARCHAR(10) NULL,
  macro_fear_greed INT NULL,
  rejected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trade_rejections_rejected_at (rejected_at),
  INDEX idx_trade_rejections_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scan_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(24) NULL,
  scan_score DECIMAL(8,3) NULL,
  direction ENUM('LONG','SHORT','NEUTRAL') NULL,
  final_score DECIMAL(8,3) NULL,
  long_score DECIMAL(8,3) NULL,
  short_score DECIMAL(8,3) NULL,
  pass_ai TINYINT(1) DEFAULT 0,
  skip_reason TEXT NULL,
  rsi14 DECIMAL(8,3) NULL,
  ema8 DECIMAL(24,10) NULL,
  ema21 DECIMAL(24,10) NULL,
  ema50 DECIMAL(24,10) NULL,
  atr_pct DECIMAL(10,4) NULL,
  vol_ratio DECIMAL(10,4) NULL,
  funding_rate DECIMAL(12,8) NULL,
  vwap DECIMAL(24,10) NULL,
  current_price DECIMAL(24,10) NULL,
  volume24h DECIMAL(24,6) NULL,
  price_change_pct DECIMAL(10,4) NULL,
  open_interest DECIMAL(24,6) NULL,
  scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scan_events_scanned_at (scanned_at),
  INDEX idx_scan_events_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS circuit_breaker (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NULL,
  consecutive_sl INT DEFAULT 0,
  triggered_at DATETIME NULL,
  expires_at DATETIME NULL,
  reason TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cb_event_created (event_type, created_at),
  INDEX idx_cb_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_trade_analysis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trade_id INT NULL,
  symbol VARCHAR(20) NULL,
  direction VARCHAR(10) NULL,
  close_type VARCHAR(10) NULL,
  stage VARCHAR(15) NULL,
  pnl_usdt DECIMAL(18,6) NULL,
  r_final DECIMAL(10,4) NULL,
  duration_minutes INT NULL,
  entry_reason TEXT NULL,
  exit_reason TEXT NULL,
  setup_label VARCHAR(120) NULL,
  ai_regime VARCHAR(32) NULL,
  ai_bias VARCHAR(16) NULL,
  tf4h_status VARCHAR(15) NULL,
  macro_bias VARCHAR(10) NULL,
  atr_pct DECIMAL(10,4) NULL,
  rsi14 DECIMAL(8,3) NULL,
  vol_ratio DECIMAL(10,4) NULL,
  funding_rate DECIMAL(12,8) NULL,
  final_score DECIMAL(8,3) NULL,
  scan_score DECIMAL(8,3) NULL,
  dynamic_threshold DECIMAL(8,3) NULL,
  entry_hour_utc INT NULL,
  analysis TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_post_trade_created_at (created_at),
  INDEX idx_post_trade_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS research_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE NOT NULL,
  report_type VARCHAR(20) NOT NULL,
  report LONGTEXT NOT NULL,
  findings JSON NULL,
  recommendations JSON NULL,
  risks JSON NULL,
  opportunities JSON NULL,
  score DECIMAL(8,3) NULL,
  model VARCHAR(80) NULL,
  source_workflow VARCHAR(120) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_research_reports_date (report_date),
  INDEX idx_research_reports_type_date (report_type, report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NULL,
  recommendation TEXT NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'recommendation',
  confidence DECIMAL(5,2) NULL,
  rationale TEXT NULL,
  evidence JSON NULL,
  status ENUM('pending','reviewing','validated','rejected') NOT NULL DEFAULT 'pending',
  review_date DATETIME NULL,
  impact_score DECIMAL(8,3) NULL,
  outcome ENUM('positive','neutral','negative') NULL,
  notes TEXT NULL,
  evidence_level VARCHAR(10) NOT NULL DEFAULT 'baja',
  implementation_status VARCHAR(20) NOT NULL DEFAULT 'en_prueba',
  implemented_at DATETIME NULL,
  implementation_reason TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ai_rec_report (report_id),
  INDEX idx_ai_rec_status_created (status, created_at),
  INDEX idx_ai_rec_category_created (category, created_at),
  CONSTRAINT fk_ai_rec_report
    FOREIGN KEY (report_id) REFERENCES research_reports(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recommendation_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recommendation_id INT NOT NULL,
  review_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  baseline_start DATETIME NULL,
  baseline_end DATETIME NULL,
  evaluation_start DATETIME NULL,
  evaluation_end DATETIME NULL,
  before_metrics JSON NULL,
  after_metrics JSON NULL,
  impact_score DECIMAL(8,3) NULL,
  outcome ENUM('positive','neutral','negative') NOT NULL DEFAULT 'neutral',
  notes TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rec_review_rec_date (recommendation_id, review_date),
  CONSTRAINT fk_rec_review_rec
    FOREIGN KEY (recommendation_id) REFERENCES ai_recommendations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_config (
  config_key VARCHAR(80) PRIMARY KEY,
  config_value VARCHAR(255) NOT NULL,
  description VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO learning_config (config_key,config_value,description) VALUES
  ('learning_enabled','1','Habilita reglas dinámicas antes de cada entrada'),
  ('learning_mode','enforce','enforce aplica reglas; observe sólo registra'),
  ('soft_min_sample','8','Muestra mínima para que un peso influya'),
  ('hard_min_sample','20','Muestra mínima para permitir un bloqueo aprendido'),
  ('full_confidence_sample','40','Muestra para confianza estadística completa'),
  ('min_weight','0.85','Peso mínimo por dimensión'),
  ('max_weight','1.12','Peso máximo por dimensión'),
  ('min_final_factor','0.70','Multiplicador compuesto mínimo'),
  ('max_final_factor','1.30','Multiplicador compuesto máximo'),
  ('block_expectancy_max','-0.75','Expectancy máxima para bloqueo fuerte'),
  ('block_profit_factor_max','0.75','Profit factor máximo para bloqueo fuerte'),
  ('block_win_rate_max','40','Win rate máximo para bloqueo fuerte'),
  ('daily_loss_limit_pct','15','Circuit breaker diario'),
  ('weekly_loss_limit_pct','20','Circuit breaker móvil de siete días'),
  ('max_drawdown_pct','25','Drawdown máximo respecto al balance'),
  ('max_consecutive_losses','4','Máximo global de pérdidas consecutivas'),
  ('max_group_consecutive_losses','4','Máximo de pérdidas seguidas por dimensión'),
  ('loss_streak_cooldown_hours','24','Pausa temporal después de una racha'),
  ('hard_block_cooldown_hours','72','Vigencia temporal de un bloqueo aprendido'),
  ('drawdown_window_days','7','Ventana móvil del circuit breaker de drawdown'),
  ('rule_ttl_hours','36','Vigencia antes de reconstruir reglas');

CREATE TABLE IF NOT EXISTS learning_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_type VARCHAR(30) NOT NULL,
  rule_key VARCHAR(255) NOT NULL,
  status ENUM('active','monitoring','suspended') NOT NULL DEFAULT 'monitoring',
  action ENUM('block','reduce','neutral','prioritize','halt') NOT NULL DEFAULT 'neutral',
  weight DECIMAL(9,6) NOT NULL DEFAULT 1,
  research_factor DECIMAL(9,6) NOT NULL DEFAULT 1,
  review_factor DECIMAL(9,6) NOT NULL DEFAULT 1,
  sample_size INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  win_rate DECIMAL(9,4) NULL,
  pnl DECIMAL(18,6) NULL,
  expectancy DECIMAL(18,6) NULL,
  profit_factor DECIMAL(12,6) NULL,
  avg_r DECIMAL(12,6) NULL,
  max_drawdown DECIMAL(18,6) NULL,
  confidence DECIMAL(9,4) NULL,
  evidence_level ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  source_recommendation_ids JSON NULL,
  rationale TEXT NULL,
  valid_from DATETIME NULL,
  expires_at DATETIME NULL,
  last_evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_learning_rule (rule_type,rule_key),
  INDEX idx_learning_rules_status (status,rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_decisions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(24) NULL,
  setup_key VARCHAR(255) NULL,
  session_key VARCHAR(16) NULL,
  regime_key VARCHAR(40) NULL,
  score_band VARCHAR(16) NULL,
  base_score DECIMAL(9,4) NULL,
  required_score DECIMAL(9,4) NULL,
  final_score DECIMAL(9,4) NULL,
  final_factor DECIMAL(9,6) NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 0,
  action VARCHAR(24) NOT NULL,
  reason TEXT NULL,
  components JSON NULL,
  capital_status JSON NULL,
  source_recommendation_ids JSON NULL,
  dry_run TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_learning_decisions_created (created_at),
  INDEX idx_learning_decisions_symbol (symbol,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_type VARCHAR(30) NOT NULL DEFAULT 'rebuild',
  rules_active INT NOT NULL DEFAULT 0,
  rules_monitoring INT NOT NULL DEFAULT 0,
  rules_suspended INT NOT NULL DEFAULT 0,
  recommendations_implemented INT NOT NULL DEFAULT 0,
  recommendations_discarded INT NOT NULL DEFAULT 0,
  summary JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_learning_runs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW daily_pnl AS
SELECT
  DATE(closed_at) AS day,
  COUNT(*) AS trades,
  SUM(pnl_usdt > 0) AS wins,
  SUM(pnl_usdt <= 0) AS losses,
  ROUND(SUM(pnl_usdt), 2) AS pnl,
  ROUND(AVG(pnl_usdt), 2) AS avg_pnl,
  ROUND(AVG(r_final), 2) AS avg_r,
  ROUND(100 * SUM(pnl_usdt > 0) / NULLIF(COUNT(*), 0), 1) AS win_rate
FROM trade_closes
GROUP BY DATE(closed_at)
ORDER BY day DESC;

CREATE OR REPLACE VIEW symbol_performance AS
SELECT
  t.symbol,
  COUNT(*) AS trades,
  SUM(tc.pnl_usdt > 0) AS wins,
  SUM(tc.pnl_usdt <= 0) AS losses,
  ROUND(SUM(tc.pnl_usdt), 2) AS total_pnl,
  ROUND(AVG(tc.pnl_usdt), 2) AS avg_pnl,
  ROUND(AVG(tc.r_final), 2) AS avg_r,
  ROUND(100 * SUM(tc.pnl_usdt > 0) / NULLIF(COUNT(*), 0), 1) AS win_rate
FROM trades t
JOIN trade_closes tc ON tc.trade_id = t.id
GROUP BY t.symbol
ORDER BY total_pnl DESC;
