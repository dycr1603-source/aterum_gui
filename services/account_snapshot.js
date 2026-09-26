'use strict';

// Exchange errors are JSON objects too; they must never become a zero balance.
function validateAccountSnapshot(balances, positions) {
  if (!Array.isArray(balances) || !Array.isArray(positions)) throw new Error('ACCOUNT_SOURCE_UNAVAILABLE');
  const usdt = balances.find(row => row.asset === 'USDT');
  const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));
  if (!usdt || !numeric(usdt.balance) || !numeric(usdt.availableBalance) || positions.some(p => !numeric(p.positionAmt) || !numeric(p.unRealizedProfit))) throw new Error('ACCOUNT_SNAPSHOT_INVALID');
  return usdt;
}
module.exports = { validateAccountSnapshot };
