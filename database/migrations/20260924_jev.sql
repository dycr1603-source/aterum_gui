-- Optional pre-provisioning; application also creates these tables idempotently.
CREATE TABLE IF NOT EXISTS jev_decisions (
  id VARCHAR(64) PRIMARY KEY,
  symbol VARCHAR(24) NOT NULL,
  result LONGTEXT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS notification_deliveries (
  event_key VARCHAR(64) PRIMARY KEY,
  status VARCHAR(24) NOT NULL,
  message_id BIGINT NULL,
  error_code VARCHAR(80) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
