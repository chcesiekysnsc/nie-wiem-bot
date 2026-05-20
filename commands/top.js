const { formatNumber } = require('../utils/economy');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'top',
  aliases: ['ranking'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    const { globalTop, groupMembers } = await withData(store => {
      const users = Object.entries(store.users || {});

      const globalTop = users
        .filter(([, u]) => (u.gamesPlayed || 0) > 0)
        .map(([id, u]) => ({ id, balance: (u.balance || 0) + (u.bank || 0) }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      const groupIds = new Set(
        (store.logs || [])
          .filter(l => l.threadID === threadId)
          .map(l => l.userId)
          .filter(Boolean)
      );

      const sourceIds = groupIds.size > 0 ? [...groupIds] : users.map(([id]) => id);

      const groupMembers = sourceIds
        .map(id => {
          const u = store.users[id];
          if (!u) return null;
          return { id, balance: (u.balance || 0) + (u.bank || 0) };
        })
        .filter(Boolean)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      return { globalTop, groupMembers };
    });

    async function getName(id) {
      if (client.userNames.has(id)) {
        return client.userNames.get(id);
      }
      if (client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const info = await new Promise((resolve) => {
            client.api.getUserInfo(id, (err, ret) => {
              if (!err && ret && ret[id]) {
                const name = ret[id].name;
                client.userNames.set(id, name);
                resolve(name);
              } else {
                resolve(null);
              }
            });
          });
          if (info) return info;
        } catch (_) {}
      }
      return `Uzytkownik_${String(id).slice(-6)}`;
    }

    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];

    const globalLines = await Promise.all(
      globalTop.map(async (u, i) => {
        const name = await getName(u.id);
        return `${medals[i]} ${name} — ${formatNumber(u.balance)}`;
      })
    );

    const groupLines = await Promise.all(
      groupMembers.map(async (u, i) => {
        const name = await getName(u.id);
        return `${medals[i]} ${name} — ${formatNumber(u.balance)}`;
      })
    );

    const responseText = 
      `🏆 **Ranking Kasynowy**\n` +
      `🌍 **Top 5 Global**\n` +
      `${globalLines.length ? globalLines.join('\n') : 'Brak danych.'}\n` +
      `👥 **Top 5 Grupy**\n` +
      `${groupLines.length ? groupLines.join('\n') : 'Brak danych grupowych.'}`;

    await message.reply(responseText);
  }
};
