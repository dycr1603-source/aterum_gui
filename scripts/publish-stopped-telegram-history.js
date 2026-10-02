#!/usr/bin/env node
'use strict';

// Recovery for a host retired before its Telegram history was published.
// Starts only MariaDB and a one-off database client, never trading consumers.
const fs = require('node:fs');
const path = require('node:path');
const { HostController } = require('./aterum-control');
const { TelegramHistorySync } = require('../services/telegram_history_sync');
const { stateDirectory } = require('../services/host_control_state');
const ROOT = path.resolve(__dirname, '..');
const TRANSFER = fs.readFileSync(path.join(__dirname, 'telegram-sync-db.js'), 'utf8');

async function publishStopped({ controller, sync, exporter = async () => JSON.parse(await controller.compose([
  'run', '--rm', '--no-deps', '-T', '--entrypoint', 'node', 'dashboard', '-e', TRANSFER, 'export'
])) }) {
  const state = controller.state();
  if (state?.mode !== 'RETIRED' || !fs.existsSync(controller.inhibitFile))
    throw new Error('TELEGRAM_SYNC_REQUIRES_RETIRED_HOST');
  const containers = await controller.containers();
  if (containers.some(c => c.running || c.restarting || c.paused))
    throw new Error('TELEGRAM_SYNC_REQUIRES_ALL_SERVICES_STOPPED');
  // Validate Git registration and both public keys before touching local services.
  await sync.register();
  const recipients = await sync.registeredRecipients();
  if (Object.keys(recipients).length < 2) throw new Error('TELEGRAM_SYNC_TWO_PUBLIC_KEYS_REQUIRED');
  await controller.compose(['config', '--quiet']);
  await controller.compose(['up', '-d', 'mysql']);
  try {
    await controller.healthy(['mysql']);
    const counts = await sync.stage(await exporter());
    await sync.publish();
    return counts;
  } finally {
    await controller.compose(['stop', '--timeout', '-1', 'mysql']);
  }
}

async function main() {
  const controller = new HostController({ directory: stateDirectory() });
  const sync = new TelegramHistorySync({ root: ROOT, directory: controller.directory,
    hostId: controller.hostId, compose: args => controller.compose(args) });
  const result = await publishStopped({ controller, sync });
  console.log(`Encrypted Telegram history published: ${result.audit} bot records, ${result.deliveries} notifications.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { publishStopped };
