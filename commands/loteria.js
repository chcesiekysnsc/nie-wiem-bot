const config = require('../config/config');
const { formatCurrency } = require('../utils/economy');
const { withData } = require('../utils/storage');

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
  name: 'loteria',
  aliases: ['lottery'],
  async execute(client, message) {
    const result = await withData(store => {
      let totalTickets = 0;

      for (const [userId, inv] of Object.entries(store.inventory || {})) {
        const ticketCount = inv.ticket || 0;
        if (ticketCount > 0) {
          totalTickets += ticketCount;
        }
      }

      return { totalTickets };
    });

    const totalPrize = result.totalTickets * 50000;
    const lastDraw = client.lastLotteryDraw || 0;
    const nextDraw = lastDraw + (10 * 60 * 1000);
    const timeUntilDraw = Math.max(0, nextDraw - Date.now());

    const timeText = msToReadable(timeUntilDraw);
    const prizeText = result.totalTickets > 0 ? formatCurrency(totalPrize) : 'Brak graczy';

    await message.reply(
      `🎟️ **INFORMACJA O LOTERII**\n` +
      `⏰ Następne losowanie za: **${timeText}**\n` +
      `🎫 Ilość biletów w grze: **${result.totalTickets}**\n` +
      `💰 Pula do wygrania: **${prizeText}**\n\n` +
      `Bilet kosztuje **50,000 Coins** (limit 5 szt.)\n` +
      `Kupuj za pomocą \`!sklep 4\``
    );
  }
};
