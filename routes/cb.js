'use strict';
const express = require('express');
const router  = express.Router();
const shared  = require('../shared');

const { db } = shared;

// ── Circuit Breaker ──────────────────────────────────────────────────────────
// Estado en memoria + DB para persistencia entre reinicios

// Cargar estado al arrancar
(async () => {
  try{
    await db.execute(`CREATE TABLE IF NOT EXISTS circuit_breaker (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_type VARCHAR(20) NOT NULL,
      direction VARCHAR(10),
      consecutive_sl INT DEFAULT 0,
      triggered_at DATETIME,
      expires_at DATETIME,
      reason TEXT,
      created_at DATETIME DEFAULT NOW()
    )`);
    // Restaurar estado activo si existe
    const [rows] = await db.execute(
      `SELECT * FROM circuit_breaker WHERE event_type='ACTIVE' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`
    );
    if(rows?.length){
      shared.cbState.active = true;
      shared.cbState.direction = rows[0].direction;
      shared.cbState.triggeredAt = rows[0].triggered_at;
      console.log(`[CB] Restaurado: pausado dirección ${shared.cbState.direction} hasta ${rows[0].expires_at}`);
    }
    // Restaurar contador de SL consecutivos
    const [slRows] = await db.execute(
      `SELECT * FROM circuit_breaker WHERE event_type='SL_COUNT' ORDER BY created_at DESC LIMIT 1`
    );
    if(slRows?.length){
      shared.cbState.consecutiveSL = slRows[0].consecutive_sl || 0;
      shared.cbState.lastDirection = slRows[0].direction;
    }
  }catch(e){ console.log('[CB] Init error:', e.message); }
})();

// GET — estado actual del circuit breaker
router.get('/cb/status', (req, res) => {
  const now = Date.now();
  const expiresIn = shared.cbState.triggeredAt
    ? Math.max(0, 2*60*60*1000 - (now - new Date(shared.cbState.triggeredAt).getTime()))
    : 0;
  res.json({
    active: shared.cbState.active,
    direction: shared.cbState.direction,
    consecutiveSL: shared.cbState.consecutiveSL,
    lastDirection: shared.cbState.lastDirection,
    triggeredAt: shared.cbState.triggeredAt,
    expiresIn: Math.floor(expiresIn / 60000), // minutes remaining
    expiresAt: shared.cbState.triggeredAt
      ? new Date(new Date(shared.cbState.triggeredAt).getTime() + 2*60*60*1000).toISOString()
      : null
  });
});

// POST — registrar SL y verificar si activar circuit breaker
router.post('/cb/sl', async (req, res) => {
  const { direction, symbol } = req.body;
  const LIMIT = 3;
  const PAUSE_MS = 2 * 60 * 60 * 1000; // 2h

  // Incrementar contador si misma dirección, resetear si cambia
  if(shared.cbState.lastDirection === direction){
    shared.cbState.consecutiveSL++;
  } else {
    shared.cbState.consecutiveSL = 1;
    shared.cbState.lastDirection = direction;
  }

  console.log(`[CB] SL registrado: ${direction} ${symbol} — consecutivos: ${shared.cbState.consecutiveSL}/${LIMIT}`);

  // Guardar contador en DB
  try{
    await db.execute(
      `INSERT INTO circuit_breaker (event_type,direction,consecutive_sl,reason) VALUES ('SL_COUNT',?,?,?)`,
      [direction, shared.cbState.consecutiveSL, `SL #${shared.cbState.consecutiveSL} en ${symbol}`]
    );
  }catch(e){}

  // Activar circuit breaker si alcanzó el límite
  if(shared.cbState.consecutiveSL >= LIMIT && !shared.cbState.active){
    shared.cbState.active = true;
    shared.cbState.direction = direction;
    shared.cbState.triggeredAt = new Date().toISOString();

    const expiresAt = new Date(Date.now() + PAUSE_MS).toISOString();
    try{
      await db.execute(
        `INSERT INTO circuit_breaker (event_type,direction,consecutive_sl,triggered_at,expires_at,reason) VALUES ('ACTIVE',?,?,NOW(),?,?)`,
        [direction, shared.cbState.consecutiveSL, expiresAt, `${LIMIT} SL consecutivos en ${direction} — pausando 2h`]
      );
    }catch(e){}

    console.log(`[CB] ⚠️  ACTIVADO — dirección ${direction} pausada por 2h hasta ${expiresAt}`);

    // Auto-resetear después de 2h
    setTimeout(() => {
      shared.cbState.active = false;
      shared.cbState.direction = null;
      shared.cbState.triggeredAt = null;
      shared.cbState.consecutiveSL = 0;
      console.log(`[CB] ✅ Expirado — operaciones ${direction} habilitadas`);
      db.execute(`INSERT INTO circuit_breaker (event_type,reason) VALUES ('EXPIRED','2h cumplidas — reset automático')`).catch(()=>{});
    }, PAUSE_MS);

    return res.json({ triggered: true, direction, expiresAt, message: `Circuit breaker activado — ${direction} pausado 2h` });
  }

  res.json({ triggered: false, consecutiveSL: shared.cbState.consecutiveSL, remaining: LIMIT - shared.cbState.consecutiveSL });
});

// POST — reset manual del circuit breaker
router.post('/cb/reset', async (req, res) => {
  shared.cbState = { active: false, direction: null, triggeredAt: null, consecutiveSL: 0, lastDirection: null };
  try{
    await db.execute(`INSERT INTO circuit_breaker (event_type,reason) VALUES ('MANUAL_RESET','Reset manual por usuario')`);
  }catch(e){}
  console.log('[CB] Reset manual');
  res.json({ ok: true, message: 'Circuit breaker reseteado' });
});

// POST — registrar TP (resetea el contador de SL consecutivos)
router.post('/cb/tp', async (req, res) => {
  const { direction, symbol } = req.body;
  if(shared.cbState.lastDirection === direction && shared.cbState.consecutiveSL > 0){
    console.log(`[CB] TP en ${symbol} — reseteando contador (era ${shared.cbState.consecutiveSL})`);
    shared.cbState.consecutiveSL = 0;
    try{
      await db.execute(
        `INSERT INTO circuit_breaker (event_type,direction,consecutive_sl,reason) VALUES ('TP_RESET',?,0,?)`,
        [direction, `TP en ${symbol} — contador reseteado`]
      );
    }catch(e){}
  }
  res.json({ ok: true });
});

module.exports = router;
