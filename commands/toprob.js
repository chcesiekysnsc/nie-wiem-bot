const { formatNumber } = require('../utils/economy');
const { withData, createUser } = require('../utils/storage');

module.exports = {
  name: 'toprob',
  aliases: ['toprob', 'rankingrob'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    async function getName(id) {
      if (client.resolvedUserNames && client.resolvedUserNames.has(id) && client.userNames.has(id)) {
        return client.userNames.get(id);
      }
      
      // Sprawdź w bazie danych
      let dbName = null;
      try {
        const { loadData } = require('../utils/storage');
        const usersData = loadData('users');
        if (usersData && usersData[id] && usersData[id].name) {
          dbName = usersData[id].name;
        }
      } catch (_) {}

      if (dbName) {
        if (client.userNames) client.userNames.set(id, dbName);
        if (client.resolvedUserNames) client.resolvedUserNames.add(id);
        return dbName;
      }

      if (client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const info = await new Promise((resolve) => {
            client.api.getUserInfo(id, (err, ret) => {
              if (!err && ret && ret[id]) {
                const name = ret[id].name;
                client.userNames.set(id, name);
                if (client.resolvedUserNames) {
                  client.resolvedUserNames.add(id);
                }
                
                // Zapisz asynchronicznie do bazy danych
                withData(store => {
                  if (store.users[id]) {
                    store.users[id].name = name;
                  }
                }).catch(console.error);

                resolve(name);
              } else {
                resolve(null);
              }
            });
          });
          if (info) return info;
        } catch (_) {}
      }
      return (client.userNames && client.userNames.get(id)) || `Uzytkownik_${String(id).slice(-6)}`;
    }

    async function preloadNames(ids) {
      const unresolved = ids.filter(id => {
        if (client.resolvedUserNames && client.resolvedUserNames.has(id)) return false;
        return true;
      });
      if (unresolved.length === 0) return;

      // Najpierw spróbujmy wczytać z bazy danych
      const toQueryApi = [];
      await withData(store => {
        for (const id of unresolved) {
          if (store.users[id] && store.users[id].name) {
            client.userNames.set(id, store.users[id].name);
            client.resolvedUserNames.add(id);
          } else {
            toQueryApi.push(id);
          }
        }
      });

      if (toQueryApi.length > 0 && client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const ret = await new Promise((resolve) => {
            client.api.getUserInfo(toQueryApi, (err, res) => {
              if (!err && res) resolve(res);
              else resolve({});
            });
          });
          
          await withData(store => {
            for (const [id, info] of Object.entries(ret)) {
              if (info && info.name) {
                client.userNames.set(id, info.name);
                client.resolvedUserNames.add(id);
                if (store.users[id]) {
                  store.users[id].name = info.name;
                }
              }
            }
          });
        } catch (err) {
          console.error('[TOPROB] Preload error:', err);
        }
      }
    }

    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];

    let participantIDs = [];
    participantIDs = await withData(store => {
      return Object.entries(store.users || {})
        .filter(([id, u]) => u.groupMessages && u.groupMessages[threadId])
        .map(([id]) => id);
    });

    const { globalTop, groupMembers, showIds } = await withData(store => {
      // Upewnij się, że autor ma swój profil w bazie
      createUser(message.author.id, store.users);

      const users = Object.entries(store.users || {});
      const showIds = store.profiles.showIds || [];

      // Wszystkie konta posortowane globalnie po liczbie użycia komendy rob
      const globalSorted = users
        .map(([id, u]) => {
          const robCount = u.commandCounts?.['rob'] || 0;
          return { id, robCount };
        })
        .sort((a, b) => b.robCount - a.robCount);

      // Top 5 Globalnie
      const globalTop = globalSorted.slice(0, 5);

      // Top 5 Grupy
      let groupMembers = [];
      if (participantIDs && participantIDs.length > 0) {
        groupMembers = participantIDs.map(id => {
          const u = store.users[id] || { commandCounts: {} };
          const robCount = u.commandCounts?.['rob'] || 0;
          return { id, robCount };
        })
        .sort((a, b) => b.robCount - a.robCount)
        .slice(0, 5);
      } else {
        groupMembers = [];
      }

      return { globalTop, groupMembers, showIds };
    });

    const allTopIds = [...new Set([...globalTop.map(u => u.id), ...groupMembers.map(u => u.id)])];
    await preloadNames(allTopIds);

    const globalLines = await Promise.all(
      globalTop.map(async (u, i) => {
        let name = await getName(u.id);
        if (showIds.includes(u.id)) {
          name = `${name} ${u.id}`;
        }
        return `${medals[i]} ${name} — ${formatNumber(u.robCount)} napadów`;
      })
    );

    const groupLines = await Promise.all(
      groupMembers.map(async (u, i) => {
        let name = await getName(u.id);
        if (showIds.includes(u.id)) {
          name = `${name} ${u.id}`;
        }
        return `${medals[i]} ${name} — ${formatNumber(u.robCount)} napadów`;
      })
    );

    const responseText = 
      `🔪 **Ranking Napadów**\n` +
      `🌍 **Top 5 Global**\n` +
      `${globalLines.length ? globalLines.join('\n') : 'Brak danych.'}\n` +
      `👥 **Top 5 Grupy**\n` +
      `${groupLines.length ? groupLines.join('\n') : 'Brak danych grupowych.'}`;

    await message.reply(responseText);
  }
};
