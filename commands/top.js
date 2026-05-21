const { formatNumber } = require('../utils/economy');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'top',
  aliases: ['ranking'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    let participantIDs = [];
    if (client.api && typeof client.api.getThreadInfo === 'function' && threadId) {
      try {
        participantIDs = await new Promise((resolve) => {
          client.api.getThreadInfo(threadId, (err, info) => {
            if (!err && info && info.participantIDs) {
              resolve(info.participantIDs);
            } else {
              resolve([]);
            }
          });
        });
      } catch (_) {}
    }

    const { globalTop, groupMembers, showIds } = await withData(store => {
      const users = Object.entries(store.users || {});
      const showIds = store.profiles.showIds || [];

      // Top 5 Globalnie (najwięcej monet ze wszystkich zarejestrowanych)
      const globalTop = users
        .map(([id, u]) => ({ id, balance: (u.balance || 0) + (u.bank || 0) }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      // Top 5 Grupy (najbardziej majętni ludzie na danej grupie)
      let groupMembers = [];
      if (participantIDs && participantIDs.length > 0) {
        // Mapujemy wszystkich uczestników grupy - jeśli nie ma ich w bazie, dajemy domyślny balans startowy (15 000)
        groupMembers = participantIDs.map(id => {
          const u = store.users[id] || { balance: 5000, bank: 10000 };
          return { id, balance: (u.balance || 0) + (u.bank || 0) };
        })
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);
      } else {
        // Fallback: Pokazujemy zarejestrowanych użytkowników
        groupMembers = users
          .map(([id, u]) => ({ id, balance: (u.balance || 0) + (u.bank || 0) }))
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 5);
      }

      return { globalTop, groupMembers, showIds };
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
        let name = await getName(u.id);
        if (showIds.includes(u.id)) {
          name = `${name} ${u.id}`;
        }
        return `${medals[i]} ${name} — ${formatNumber(u.balance)}`;
      })
    );

    const groupLines = await Promise.all(
      groupMembers.map(async (u, i) => {
        let name = await getName(u.id);
        if (showIds.includes(u.id)) {
          name = `${name} ${u.id}`;
        }
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
