'use strict';

const assert = require('assert');
const fs = require('fs');

const nginx = fs.readFileSync('bot-control/infra/nginx/nginx.conf', 'utf8');
const compose = fs.readFileSync('bot-control/infra/docker-compose.example.yml', 'utf8');

assert(nginx.includes('resolver 127.0.0.11 valid=10s ipv6=off;'), 'Docker DNS resolver is missing');
for (const endpoint of ['dashboard:3001', 'dashboard:3000', 'dashboard:5678']) {
  assert(nginx.includes(`server ${endpoint} resolve;`), `${endpoint} is not dynamically resolved`);
}
assert(compose.includes('N8N_RUNNERS_TASK_REQUEST_TIMEOUT: ${N8N_RUNNERS_TASK_REQUEST_TIMEOUT:-180}'));
assert(compose.includes('EXECUTIONS_CONCURRENCY_PRODUCTION_LIMIT: ${EXECUTIONS_CONCURRENCY_PRODUCTION_LIMIT:-10}'));
assert(compose.includes("curl -fsS http://127.0.0.1:5678/healthz >/dev/null || { kill -TERM 1; exit 1; }"));

console.log('n8n recovery config tests: ok');
