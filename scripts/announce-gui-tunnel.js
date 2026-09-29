'use strict';

// Runs inside the Dashboard container so tunnel announcements use Aterum's
// existing Telegram delivery ledger, MySQL connection and credentials.
const { deliver } = require('../services/telegram_delivery');
const shared = require('../shared');

async function main() {
  const [url, bootId, attemptText = '1', browserConfirmationText = '0'] = process.argv.slice(2);
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new Error('INVALID_PUBLIC_URL'); }
  if (parsed.protocol !== 'https:' || !/(^|\.)ngrok(-free)?\.(app|io|dev)$/i.test(parsed.hostname)) {
    throw new Error('UNTRUSTED_PUBLIC_URL');
  }
  if (!bootId || !/^[a-zA-Z0-9-]{1,80}$/.test(bootId)) throw new Error('INVALID_BOOT_ID');
  const attempt = Math.max(1, Math.min(3, Number.parseInt(attemptText, 10) || 1));
  const browserConfirmationRequired = browserConfirmationText === '1';
  const eventKey = `gui-tunnel:${bootId}:${parsed.origin}:attempt:${attempt}`;
  const result = await deliver({
    db: shared.db,
    eventKey,
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    text: [
      `🟢 GUI disponible: ${parsed.origin}`,
      '',
      '🔐 Acceso protegido: inicia sesión con tus credenciales habituales de Aterum.',
      ...(browserConfirmationRequired ? ['', 'ℹ️ Primera visita: ngrok puede mostrar «Visit Site». Confírmalo una vez; recordará este navegador durante 7 días.'] : [])
    ].join('\n')
  });
  if (result.status === 'SENT' || result.status === 'DUPLICATE') {
    process.stdout.write(result.status + '\n');
    return 0;
  }
  process.stderr.write('TELEGRAM_' + (result.errorCode || result.status) + '\n');
  return result.status === 'UNKNOWN' ? 3 : 1;
}

main().then(code => shared.db.end().finally(() => { process.exitCode = code; }))
  .catch(error => {
    process.stderr?.write((/INVALID_PUBLIC_URL|UNTRUSTED_PUBLIC_URL|INVALID_BOOT_ID/.test(error.message)
      ? error.message : 'TELEGRAM_DELIVERY_FAILED') + '\n');
    shared.db.end().finally(() => { process.exitCode = 1; });
  });
