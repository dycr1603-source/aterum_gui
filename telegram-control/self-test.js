'use strict';

const config = require('./config');
const { ApiClient } = require('./api');
const { AuditStore } = require('./audit');
const { TelegramClient } = require('./telegram');
const { createCommands } = require('./commands');

(async () => {
  if (!config.token) throw new Error('TELEGRAM_BOT_TOKEN is required for integration self-test');
  const api = new ApiClient(config);
  const audit = new AuditStore(config);
  const telegram = new TelegramClient(config);
  await audit.initialize();
  await audit.bootstrapAdmins([...config.allowedUserIds]);
  const commands = createCommands({ config, api, audit, telegram });
  const stats = await api.stats();
  const symbol = String(stats.recent?.[0]?.symbol || 'BTCUSDT').toUpperCase();
  const cases = [
    ...['start', 'status', 'balance', 'positions', 'performance', 'research', 'learning', 'health', 'logs', 'news', 'ai', 'context', 'changes', 'help', 'tutorial', 'new']
      .map(command => ({ command, args: [], role: 'viewer' })),
    { command: 'guide', args: ['1'], role: 'viewer' },
    { command: 'explain', args: ['meaning', 'performance'], role: 'viewer' },
    { command: 'ask', args: ['¿Qué', 'es', 'drawdown?'], role: 'viewer', localOnly: true },
    { command: 'why', args: [symbol], role: 'viewer' },
    { command: 'evidence', args: [symbol], role: 'viewer' },
    { command: 'history', args: [symbol], role: 'viewer' },
    { command: 'simulate', args: [], role: 'moderator' },
    { command: 'scan', args: [], role: 'moderator' },
    { command: 'rebuild-report', args: [], role: 'moderator' },
    { command: 'users', args: [], role: 'admin' }
  ];
  const results = [];
  try {
    for (const testCase of cases) {
      const started = Date.now();
      const response = await commands.execute(testCase.command, testCase.args, { role: testCase.role });
      if (!response || response.length < 20) throw new Error(`${testCase.command} returned an empty response`);
      if (testCase.localOnly && !response.includes('No se consultó Claude')) throw new Error(`${testCase.command} did not use local knowledge`);
      results.push({ command: `/${testCase.command}`, role: testCase.role, ok: true, chars: response.length, ms: Date.now() - started });
    }
    if (commands.allowed('viewer', 'simulate')) throw new Error('viewer can access /simulate');
    if (commands.allowed('moderator', 'users')) throw new Error('moderator can access /users');
    if (!commands.allowed('admin', 'users')) throw new Error('admin cannot access /users');
    results.push({ permissions: 'viewer/moderator/admin', ok: true });
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await audit.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
