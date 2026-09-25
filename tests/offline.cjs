'use strict';
// Preload for regression tests: never load local secrets or contact live services.
const envFile = require.resolve('../services/load_env');
require.cache[envFile] = { id: envFile, filename: envFile, loaded: true, exports: { loadLocalEnv() {} } };
require('net').Socket.prototype.connect = function() { throw new Error('OFFLINE_TEST_NETWORK_BLOCKED'); };
global.fetch = async () => { throw new Error('OFFLINE_TEST_FETCH_BLOCKED'); };
