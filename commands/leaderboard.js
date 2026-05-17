const { infoEmbed } = require('../utils/embeds');
const { formatCurrency, refreshBadges, ensureInventoryRecord } = require('../utils/economy');
const { withData } = require('../utils/storage');

const PODIUM = ['🥇', '🥈', '🥉'];

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  async execute(client, message) {
    const ranking = await withData(store => {
      for (const [userId] of Object.entries(store.users)) {
        refreshBadges(store.users[userId], ensureInventoryRecord(store.inventory, userId));
      }

      return Object.entries(store.users)
        .sort(([, left], [, right]) => right.balance - left.balance)
        .slice(0, 10)
        .map(([userId, user], index) => ({
          place: index + 1,
          userId,
          balance: user.balance
        }));
    });

    if (!ranking.length) {
      await message.reply({
        embeds: [infoEmbed('Leaderboard', 'Brak danych do wyswietlenia.')]
      });
      return;
    }

    const lines = await Promise.all(ranking.map(async entry => {
      let label = `<@${entry.userId}>`;
      const cached = client.users.cache.get(entry.userId);

      if (cached) {
        label = cached.tag;
      } else {
        try {
          const fetched = await client.users.fetch(entry.userId);
          label = fetched.tag;
        } catch (error) {
          label = `<@${entry.userId}>`;
        }
      }

      const prefix = PODIUM[entry.place - 1] || `#${entry.place}`;
      return `${prefix} **${label}** - ${formatCurrency(entry.balance)}`;
    }));

    const embed = infoEmbed('Leaderboard', lines.join('\n'))
      .addFields({ name: 'Sortowanie', value: 'Po `balance` malejaco', inline: false });

    await message.reply({ embeds: [embed] });
  }
};
