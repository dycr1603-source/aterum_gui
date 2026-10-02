'use strict';

// Executed inside the Dashboard container by host control. JSON travels over
// docker exec pipes; it is never written to the repository or to Docker logs.
const mysql = require('mysql2/promise');
const AUDIT_COLUMNS = ['update_id','user_id','username','role','group_name','chat_id','command',
  'request_text','response','duration_ms','result','endpoints_used','errors','ip','created_at'];
const DELIVERY_COLUMNS = ['event_key','status','message_id','error_code','chat_id','message_text','created_at','updated_at'];

async function ensureTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS telegram_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, update_id BIGINT NULL, user_id BIGINT NULL,
    username VARCHAR(255) NULL, role VARCHAR(16) NULL, group_name VARCHAR(255) NULL,
    chat_id BIGINT NOT NULL, command VARCHAR(64) NOT NULL, request_text TEXT NULL,
    response MEDIUMTEXT NULL, duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
    result VARCHAR(32) NOT NULL, endpoints_used JSON NULL, errors TEXT NULL,
    ip VARCHAR(45) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_telegram_audit_update (update_id), INDEX idx_telegram_audit_chat_date (chat_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query('ALTER TABLE telegram_audit ADD COLUMN IF NOT EXISTS request_text TEXT NULL AFTER command');
  await db.query(`CREATE TABLE IF NOT EXISTS notification_deliveries (
    event_key VARCHAR(64) PRIMARY KEY, status VARCHAR(24) NOT NULL,
    message_id BIGINT NULL, error_code VARCHAR(80) NULL,
    chat_id BIGINT NULL, message_text TEXT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  await db.query('ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS chat_id BIGINT NULL');
  await db.query('ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS message_text TEXT NULL');
  await db.query(`CREATE TABLE IF NOT EXISTS telegram_synced_deliveries (
    source_host CHAR(64) NOT NULL, event_key VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL, message_id BIGINT NULL, error_code VARCHAR(80) NULL,
    chat_id BIGINT NULL, message_text TEXT NULL,
    created_at DATETIME(3) NULL, updated_at DATETIME(3) NULL,
    PRIMARY KEY (source_host,event_key)
  ) ENGINE=InnoDB`);
}

async function transfer(db, mode, snapshot) {
  await ensureTables(db);
  if (mode === 'export') {
    const [audit] = await db.query(`SELECT ${AUDIT_COLUMNS.join(',')} FROM telegram_audit WHERE update_id IS NOT NULL ORDER BY update_id`);
    const [deliveries] = await db.query(`SELECT ${DELIVERY_COLUMNS.join(',')} FROM notification_deliveries ORDER BY event_key`);
    return { schema: 'aterum-telegram-history-v1', audit, deliveries };
  }
  if (mode !== 'import' || snapshot?.schema !== 'aterum-telegram-history-v1'
      || !/^[0-9a-f]{64}$/.test(String(snapshot.sourceHost || ''))
      || !Array.isArray(snapshot.audit) || !Array.isArray(snapshot.deliveries)) throw new Error('INVALID_TELEGRAM_SNAPSHOT');
  if (snapshot.audit.length > 100000 || snapshot.deliveries.length > 100000) throw new Error('TELEGRAM_SNAPSHOT_TOO_LARGE');
  let auditAdded = 0, deliveriesAdded = 0;
  await db.beginTransaction();
  try {
    for (const row of snapshot.audit) {
      if (!Number.isSafeInteger(Number(row.update_id)) || !Number.isSafeInteger(Number(row.chat_id))) throw new Error('INVALID_TELEGRAM_ROW');
      const [result] = await db.execute(`INSERT IGNORE INTO telegram_audit (${AUDIT_COLUMNS.join(',')})
        VALUES (${AUDIT_COLUMNS.map(() => '?').join(',')})`, AUDIT_COLUMNS.map(key =>
        key === 'endpoints_used' && row[key] != null && typeof row[key] !== 'string'
          ? JSON.stringify(row[key]) : row[key] ?? null));
      auditAdded += result.affectedRows;
      if (!result.affectedRows) await db.execute(`UPDATE telegram_audit
        SET request_text=COALESCE(request_text,?),response=COALESCE(response,?) WHERE update_id=?`,
      [row.request_text ?? null, row.response ?? null, row.update_id]);
    }
    for (const row of snapshot.deliveries) {
      if (!/^[0-9a-f]{64}$/.test(String(row.event_key || ''))) throw new Error('INVALID_DELIVERY_ROW');
      const [result] = await db.execute(`INSERT IGNORE INTO telegram_synced_deliveries (source_host,${DELIVERY_COLUMNS.join(',')})
        VALUES (${['source_host',...DELIVERY_COLUMNS].map(() => '?').join(',')})`,
      [snapshot.sourceHost, ...DELIVERY_COLUMNS.map(key => row[key] ?? null)]);
      deliveriesAdded += result.affectedRows;
      if (!result.affectedRows) await db.execute(`UPDATE telegram_synced_deliveries SET
        status=IF(status='SENT',status,IF(?='SENT','SENT',status)),
        message_id=COALESCE(message_id,?),chat_id=COALESCE(chat_id,?),message_text=COALESCE(message_text,?)
        WHERE source_host=? AND event_key=?`, [row.status, row.message_id ?? null, row.chat_id ?? null,
        row.message_text ?? null, snapshot.sourceHost, row.event_key]);
    }
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  return { auditAdded, deliveriesAdded };
}

async function main() {
  const db = await mysql.createConnection({ host: process.env.DB_HOST || 'mysql',
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    timezone: 'Z', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
  try {
    const mode = process.argv.at(-1);
    let snapshot;
    if (mode === 'import') {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      snapshot = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    process.stdout.write(JSON.stringify(await transfer(db, mode, snapshot)) + '\n');
  } finally { await db.end(); }
}
if (require.main === module || ['export','import'].includes(process.argv[1]))
  main().catch(() => { console.error('TELEGRAM_DB_TRANSFER_FAILED'); process.exitCode = 1; });
module.exports = { transfer, AUDIT_COLUMNS, DELIVERY_COLUMNS };
