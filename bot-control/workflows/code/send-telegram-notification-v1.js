const payload = $input.first().json;
const text = String(payload.telegramText ?? payload.text ?? '').trim();

if (!text) {
  return [{ json: { ...payload, notificationStatus: 'SKIPPED_NO_TEXT' } }];
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
if (!token || !chatId) throw new Error('Telegram environment variables are not configured');

const response = await this.helpers.httpRequest({
  method: 'POST',
  url: `https://api.telegram.org/bot${token}/sendMessage`,
  json: true,
  timeout: 10000,
  body: {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  }
});

if (response?.ok !== true) throw new Error(`Telegram rejected notification: ${JSON.stringify(response).slice(0, 500)}`);
return [{ json: { ...payload, notificationStatus: 'SENT', telegramMessageId: response.result?.message_id ?? null } }];
