const config = require('../config/config');

function msToReadable(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours ? `${hours}h` : null,
    minutes ? `${minutes}m` : null,
    `${seconds}s`
  ].filter(Boolean).join(' ');
}

module.exports = {
  name: 'podatki',
  aliases: ['tax', 'taxes'],
  async execute(client, message) {
    const timeUntilTax = typeof client.getMsUntilNextTaxTime === 'function'
      ? client.getMsUntilNextTaxTime()
      : Math.max(0, (client.lastTaxCollection || 0) + (12 * 60 * 60 * 1000) - Date.now());

    const timeText = msToReadable(timeUntilTax);

    await message.reply(
      `📊 **INFORMACJA O PODATKACH**\n` +
      `⏰ Następny pobór za: **${timeText}**\n` +
      `💸 Podatek od salda: **2% co 12h**\n` +
      `💰 Podatek przy !tip: **5%**\n\n` +
      `Podatki są automatycznie pobierane co 12 godzin ze wszystkich graczy.`
    );
  }
};
