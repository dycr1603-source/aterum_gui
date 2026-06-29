'use strict';

const assert = require('assert');
const { commandFrom, identity } = require('./index');
const { commandAllowed } = require('./commands');
const { splitMessage } = require('./telegram');
const knowledge = require('./knowledge');

assert.deepEqual(commandFrom({ message: { text: '/status' } }, 'Delcon8n_bot'), { command: 'status', args: [], source: 'message' });
assert.deepEqual(commandFrom({ message: { text: '/why@Delcon8n_bot BTCUSDT' } }, 'Delcon8n_bot'), { command: 'why', args: ['BTCUSDT'], source: 'message' });
assert.deepEqual(commandFrom({ message: { text: '/trade 50' } }, 'Delcon8n_bot'), { command: 'trade', args: ['50'], source: 'message' });
assert.deepEqual(commandFrom({ message: { text: '@Delcon8n_bot status' } }, 'Delcon8n_bot'), { command: 'status', args: [], source: 'mention' });
assert.deepEqual(commandFrom({ message: { text: '@Delcon8n_bot explica el drawdown' } }, 'Delcon8n_bot'), { command: 'ask', args: ['explica', 'el', 'drawdown'], source: 'mention' });
assert.deepEqual(commandFrom({ message: { text: '¿Qué es Research?', chat: { type: 'private' } } }, 'Delcon8n_bot'), { command: 'ask', args: ['¿Qué', 'es', 'Research?'], source: 'conversation' });
assert.equal(commandFrom({ message: { text: 'status' } }, 'Delcon8n_bot'), null);
assert.equal(commandAllowed('viewer', 'status'), true);
assert.equal(commandAllowed('viewer', 'ask'), true);
assert.equal(commandAllowed('viewer', 'timeline'), true);
assert.equal(commandAllowed('viewer', 'simulate'), false);
assert.equal(commandAllowed('moderator', 'simulate'), true);
assert.equal(commandAllowed('moderator', 'users'), false);
assert.equal(commandAllowed('admin', 'users'), true);
assert.equal(knowledge.commandIntent('¿Cómo está el balance?'), 'balance');
assert.equal(knowledge.commandIntent('muéstrame el historial BTCUSDT').command, 'history');
assert.match(knowledge.answer('¿Qué significa Profit Factor?'), /No se consultó Claude/);
assert.equal(knowledge.answer('analiza correlaciones complejas entre cambios'), null);
assert.equal(splitMessage('a\n'.repeat(5000)).every(chunk => chunk.length <= 3800), true);
assert.equal(splitMessage('x'.repeat(9000)).every(chunk => chunk.length <= 3800), true);

const actor = identity({ message: { message_id: 9, chat: { id: -1, type: 'supergroup', title: 'Aterum' }, from: { id: 7, username: 'operator', first_name: 'Op' } } });
assert.equal(actor.chatId, '-1');
assert.equal(actor.userId, '7');
assert.equal(actor.groupName, 'Aterum');
assert.equal(actor.messageId, 9);

console.log('telegram-control unit tests: ok');
