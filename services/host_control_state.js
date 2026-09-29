'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function stateDirectory() {
  return process.env.ATERUM_CONTROL_STATE_DIR || path.join(os.homedir(), '.local/state/aterum-control');
}
function isInhibited() { return fs.existsSync(path.join(stateDirectory(), 'inhibited')); }
module.exports = { stateDirectory, isInhibited };
