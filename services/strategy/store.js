"use strict";
const { metrics, breakdown } = require("./metrics");
function parse(x) {
  return typeof x === "string" ? JSON.parse(x) : x;
}
async function ensure(db) {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS strategy_events (event_key VARCHAR(100) PRIMARY KEY,event_type VARCHAR(24) NOT NULL,payload JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX idx_strategy_type_time(event_type,created_at)) ENGINE=InnoDB`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS strategy_breaker (id INT PRIMARY KEY,halted BOOLEAN NOT NULL DEFAULT FALSE,reason VARCHAR(255) NULL,peak_equity DOUBLE NOT NULL DEFAULT 0,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`,
  );
  await db.execute("INSERT IGNORE INTO strategy_breaker (id) VALUES (1)");
}
async function record(db, key, type, payload) {
  await db.execute(
    "INSERT INTO strategy_events (event_key,event_type,payload) VALUES (?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)",
    [key, type, JSON.stringify(payload)],
  );
}
async function halt(db, reason) {
  await db.execute(
    "UPDATE strategy_breaker SET halted=TRUE,reason=?,updated_at=NOW(3) WHERE id=1",
    [String(reason).slice(0, 255)],
  );
}
async function status(db, equity = null) {
  if (Number.isFinite(equity))
    await db.execute(
      "UPDATE strategy_breaker SET peak_equity=GREATEST(peak_equity,?),updated_at=NOW(3) WHERE id=1",
      [equity],
    );
  const [rows] = await db.execute("SELECT * FROM strategy_breaker WHERE id=1");
  if (!rows[0]) throw Error("STRATEGY_BREAKER_UNAVAILABLE");
  return rows[0];
}
async function performance(db, capital = 1000) {
  const [rows] = await db.execute(
    "SELECT payload FROM strategy_events WHERE event_type='CLOSE' ORDER BY created_at",
  );
  const all = rows.map((r) => parse(r.payload)),
    trades = all
      .filter((t) => t.accountingComplete === true)
      .sort((a, b) => a.exitTime - b.exitTime);
  const [resets] = await db.execute(
    "SELECT created_at FROM strategy_events WHERE event_type='BREAKER_RESET' ORDER BY created_at DESC LIMIT 1",
  );
  const resumeAfter = resets[0] ? Date.parse(resets[0].created_at) : 0;
  let lossStreak = 0;
  for (const t of trades.filter((t) => t.exitTime > resumeAfter))
    lossStreak = t.net < 0 ? lossStreak + 1 : 0;
  return {
    metrics: metrics(
      trades,
      capital,
      null,
      trades[0]?.entryTime ?? null,
      trades.at(-1)?.exitTime ?? null,
    ),
    breakdown: breakdown(trades, capital),
    accountingPending: all.length - trades.length,
    lossStreak,
    trades,
  };
}
module.exports = { ensure, record, halt, status, performance, parse };
