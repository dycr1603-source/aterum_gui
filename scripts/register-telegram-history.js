#!/usr/bin/env node
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { stateDirectory } = require('../services/host_control_state');
const { TelegramHistorySync } = require('../services/telegram_history_sync');
const root = path.resolve(__dirname, '..');
const hostId = crypto.createHash('sha256').update(fs.readFileSync('/etc/machine-id', 'utf8').trim()).digest('hex');
const sync = new TelegramHistorySync({ root, directory: stateDirectory(), hostId });
sync.register().then(() => console.log('Telegram sync public key registered; private key remains on this PC.'))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
