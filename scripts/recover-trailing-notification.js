'use strict';

// Read a failed notification and its verified SL receipt, then send only the notice.
// This script never calls Binance or the execution endpoint.
const { DatabaseSync } = require('node:sqlite');
const { parse } = require('flatted');
const { db } = require('../shared');

async function main() {
  const executionId = process.argv[2];
  const runId = Number(process.argv[3]);
  if (!/^[a-f0-9-]{36}$/.test(executionId || '') || !Number.isInteger(runId))
    throw new Error('Usage: recover-trailing-notification.js execution-id n8n-run-id');
  const sqlite = new DatabaseSync(process.env.N8N_SQLITE_DB || '/n8n-data/database.sqlite', { readOnly: true });
  let saved;
  try {
    const row = sqlite.prepare('SELECT data FROM execution_data WHERE executionId=?').get(runId);
    saved = row && parse(row.data);
  } finally { sqlite.close(); }
  if (saved?.resultData?.error?.description !== 'Bad Request: chat not found')
    throw new Error('No definitive rejected Telegram delivery to recover');
  const items = saved.resultData.runData?.['Trailing Manager Code']?.[0]?.data?.main?.[0] || [];
  const item = items.find(x => x.json.executionId === executionId)?.json;
  if (!item?.telegramText || item.status !== 'SL_UPDATED' || item.finalStatus !== 'VERIFIED')
    throw new Error('Verified historical update missing');
  const [rows] = await db.execute('SELECT * FROM trade_executions WHERE execution_id=?', [executionId]);
  const receipt = rows[0];
  const verification = receipt && JSON.parse(receipt.verification_result);
  if (receipt?.symbol !== item.symbol || receipt.final_status !== 'VERIFIED'
      || !['MOVE_STOP_LOSS', 'TRAILING_STOP'].includes(receipt.request_type)
      || verification?.verified !== true || verification.pipelineVerified !== true
      || verification.persistenceStatus !== 'VERIFIED'
      || Number(verification.requested?.targetPrice) !== Number(item.newSL))
    throw new Error('Receipt does not verify this historical SL update');
  const initialGross = item.initialRisk * verification.after.position.qty;
  const remainingGross = Math.max(0, receipt.position_side === 'SHORT'
    ? item.newSL - item.entryPrice : item.entryPrice - item.newSL) * verification.after.position.qty;
  const reduction = remainingGross < initialGross && item.stage === 'INITIAL';
  const original = item.telegramText.replace('SL ACTUALIZADO — INITIAL',
    reduction ? 'SL ACTUALIZADO — RIESGO REDUCIDO' : 'SL ACTUALIZADO — INITIAL');
  const text = ['📬 AVISO RECUPERADO · AJUSTE YA REALIZADO',
    'Telegram rechazó el envío original. Estos valores corresponden al momento del ajuste.',
    '✅ Binance confirmó el cambio y la persistencia.',
    `🆔 Ejecución: ${executionId}`,
    `🛡 Riesgo sin comisiones: $${initialGross.toFixed(3)} → $${remainingGross.toFixed(3)}`,
    '', original].join('\n');
  const r = await fetch(`${process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001'}/internal/notifications/telegram`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN}`,
      'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ eventKey: `stop-update:${executionId}`, text, parseMode: 'HTML' })
  });
  if (!r.ok) throw new Error('Notification service unavailable');
  const result = await r.json();
  console.log(JSON.stringify({ executionId, symbol: item.symbol, ...result }));
  if (!['SENT', 'DUPLICATE'].includes(result.status)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
