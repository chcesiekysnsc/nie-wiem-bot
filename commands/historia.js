const { formatCurrency } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'historia',
  aliases: ['history', 'stats', 'statystyki'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const userName = message.author.username || `Użytkownik_${userId.slice(-6)}`;
    const todayKey = new Date().toISOString().slice(0, 10);

    const result = await withData(store => {
      const user = createUser(userId, store.users);

      // Top 3 komendy
      const cmdCounts = user.commandCounts || {};
      const sortedCmds = Object.entries(cmdCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      // Statystyki zysku/straty dzisiaj
      const daily = user.dailyStats || {};
      let earned = 0;
      let lost = 0;
      if (daily.date === todayKey) {
        earned = daily.earned || 0;
        lost = daily.lost || 0;
      }

      return { sortedCmds, earned, lost };
    });

    const topLines = result.sortedCmds.length > 0
      ? result.sortedCmds.map(([cmd, count], idx) => {
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
          return `${medal} **!${cmd}** — **${count}** razy`;
        }).join('\n')
      : 'Brak użytych komend.';

    const response = 
      `📜 **Historia i bilans aktywności — ${userName}**\n\n` +
      `🔥 **Top 3 najczęściej używane komendy:**\n` +
      `${topLines}\n\n` +
      `📅 **Dzisiejszy bilans finansowy (${todayKey}):**\n` +
      `📈 Zysk dzisiaj: **+${formatCurrency(result.earned)}**\n` +
      `📉 Strata dzisiaj: **-${formatCurrency(result.lost)}**`;

    await message.reply(response);
  }
};
