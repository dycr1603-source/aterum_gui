"use strict";
const express = require("express"),
  { timingSafeEqual } = require("node:crypto"),
  shared = require("../shared"),
  jev = require("../services/jev");
const engine = require("../services/strategy/engine"),
  store = require("../services/strategy/store"),
  { load, promotion } = require("../services/strategy/policy"),
  { requireAuth } = require("../middleware/auth");
const router = express.Router();
let running = false;
function internal(req, res, next) {
  const token = process.env.EXECUTION_ENGINE_TOKEN,
    a = Buffer.from(req.get("authorization") || ""),
    b = Buffer.from(`Bearer ${token || ""}`);
  if (!token || a.length !== b.length || !timingSafeEqual(a, b))
    return res.sendStatus(401);
  next();
}
router.get("/internal/strategy/status", internal, (_req, res) => {
  try {
    const policy = load();
    res.json({
      engine: process.env.STRATEGY_ENGINE || "legacy",
      mode: policy.mode,
      promotion: promotion(policy, engine.readReport()),
    });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});
router.post("/internal/strategy/cycle", internal, async (_req, res) => {
  if (running) return res.status(409).json({ error: "STRATEGY_CYCLE_RUNNING" });
  running = true;
  try {
    if (process.env.STRATEGY_ENGINE !== "two-indicator")
      return res.status(409).json({ error: "STRATEGY_NOT_ENABLED" });
    const cfg = jev.config();
    const result = await engine.cycle({
      db: shared.db,
      evaluateJev: (d) => {
        if (!cfg.enabled || (load().mode === "enforce" && cfg.observe))
          throw Error("JEV_ENFORCEMENT_REQUIRED");
        return jev.evaluate(d, { cfg });
      },
    });
    res.json(result);
  } catch (e) {
    res.status(503).json({ error: e.message });
  } finally {
    running = false;
  }
});
router.get("/api/strategy/performance", requireAuth, async (_req, res) => {
  try {
    const policy = load();
    await store.ensure(shared.db);
    res.setHeader("Cache-Control", "no-store");
    const live = await store.performance(shared.db, policy.initialCapital);
    const [events] = await shared.db.execute(
      "SELECT event_type,payload,created_at FROM strategy_events WHERE event_type IN ('DECISION','UNIVERSE') ORDER BY created_at DESC LIMIT 20",
    );
    res.json({
      policy,
      promotion: promotion(policy, engine.readReport()),
      research: engine.readReport(),
      live: { ...live, trades: undefined },
      breaker: await store.status(shared.db),
      recent: events.map((e) => ({ ...e, payload: store.parse(e.payload) })),
    });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});
module.exports = router;
