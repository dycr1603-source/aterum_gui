ARG N8N_BASE_IMAGE=n8nio/n8n:latest
FROM ${N8N_BASE_IMAGE}

USER root

COPY curl-shim.js /usr/local/bin/curl
RUN chmod +x /usr/local/bin/curl

RUN node <<'NODE'
const fs = require('fs');
const path = require('path');

function findFile(dir, filename) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === filename) return full;
    if (entry.isDirectory()) {
      try {
        const found = findFile(full, filename);
        if (found) return found;
      } catch {}
    }
  }
  return null;
}

const root = '/usr/local/lib/node_modules/n8n';
const jsRunner = findFile(root, 'js-task-runner.js');
const runnerProcess = findFile(root, 'task-runner-process-js.js');

if (!jsRunner) throw new Error('js-task-runner.js not found');
if (!runnerProcess) throw new Error('task-runner-process-js.js not found');

let js = fs.readFileSync(jsRunner, 'utf8');
const newRunDirectly = "const fn = new Function('context', `with(context) { return (async function() {${code}\\n}).call(context); }`);";
if (!js.includes(newRunDirectly)) {
  const oldRunDirectly = "const fn = new Function('context', `with(context) { return (async function() {${code}\\n})(); }`);";
  if (!js.includes(oldRunDirectly)) {
    const start = js.indexOf('const fn = new Function');
    throw new Error(`runDirectly pattern not found near: ${js.slice(start, start + 180)}`);
  }
  js = js.replace(oldRunDirectly, newRunDirectly);
  fs.writeFileSync(jsRunner, js);
}

let proc = fs.readFileSync(runnerProcess, 'utf8');
const oldEnv = 'const envVars = Object.assign(Object.create(null), {';
const newEnv = 'const envVars = Object.assign(Object.create(null), process.env, {';
if (!proc.includes(newEnv)) {
  if (!proc.includes(oldEnv)) throw new Error('runner env pattern not found');
  proc = proc.replace(oldEnv, newEnv);
  fs.writeFileSync(runnerProcess, proc);
}

console.log(`Patched ${jsRunner}`);
console.log(`Patched ${runnerProcess}`);
NODE

USER node
