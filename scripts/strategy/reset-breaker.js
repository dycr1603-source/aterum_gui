"use strict";
require("../../services/load_env");
const shared = require("../../shared"),
  store = require("../../services/strategy/store");
async function main() {
  const reason = process.argv.slice(2).join(" ").trim();
  if (reason.length < 10)
    throw Error(
      'Usage: node scripts/strategy/reset-breaker.js "reason after investigating and reconciling"',
    );
  await store.ensure(shared.db);
  const response = await fetch(
    process.env.JEV_CAPACITY_URL ||
      "http://position_guard:3091/portfolio-capacity",
    {
      headers: {
        authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN}`,
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw Error("CAPACITY_UNAVAILABLE");
  const c = await response.json();
  if (
    c.allowed !== true ||
    Date.now() - Date.parse(c.checkedAt) > 120000 ||
    !Number.isFinite(Date.parse(c.checkedAt))
  )
    throw Error("CAPACITY_NOT_HEALTHY");
  const [local] = await shared.db.execute(
    "SELECT symbol,direction,qty FROM trades WHERE status='OPEN'",
  );
  if (
    local.length !== c.positions.length ||
    local.some(
      (t) =>
        !c.positions.some(
          (p) =>
            p.symbol === t.symbol &&
            p.direction === t.direction &&
            Math.abs(Number(p.quantity) - Number(t.qty)) <
              Math.max(1e-8, Number(t.qty) * 1e-6),
        ),
    )
  )
    throw Error("RECONCILIATION_REQUIRED");
  const perf = await store.performance(shared.db);
  if (perf.accountingPending) throw Error("ACCOUNTING_PENDING");
  await store.record(shared.db, `reset:${Date.now()}`, "BREAKER_RESET", {
    reason,
    previous: await store.status(shared.db),
    equity: c.account.equity,
  });
  await shared.db.execute(
    "UPDATE strategy_breaker SET halted=FALSE,reason=NULL,peak_equity=?,updated_at=NOW(3) WHERE id=1",
    [c.account.equity],
  );
  console.log(
    "Strategy breaker reset with audit reason; strategy promotion checks remain active.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => shared.db.end());
