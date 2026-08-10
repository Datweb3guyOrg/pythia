/** One HTTP call to Telegram's Bot API — no separate bot process/hosting needed. */
export async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // not configured — silently skip, not an error

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (!res.ok) {
      console.warn(`Telegram alert failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`Telegram alert failed: ${(err as Error).message}`);
  }
}
