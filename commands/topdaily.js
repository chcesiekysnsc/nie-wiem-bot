const { formatNumber } = require('../utils/economy');
const { withData, createUser } = require('../utils/storage');

module.exports = {
  name: 'topdaily',
  aliases: ['rankingdaily', 'topdzienny'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    async function getName(id) {
      if (client.resolvedUserNames && client.resolvedUserNames.has(id) && client.userNames.has(id)) {
        return client.userNames.get(id);
      }
      
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
          console.error('[TOPDAILY] Preload error:', err);
        }
      }
    }

    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];

    const { globalTop, groupMembers, showIds } = await withData(store => {
      createUser(message.author.id, store.users);

      const users = Object.entries(store.users || {});
      const showIds = store.profiles.showIds || [];

      const globalSorted = users
        .map(([id, u]) => {
          return { id, dailyStreak: u.dailyStreak || 0, lastDailyClaim: u.lastDailyClaim || 0 };
        })
        .sort((a, b) => {
          if (b.dailyStreak !== a.dailyStreak) return b.dailyStreak - a.dailyStreak;
          return b.lastDailyClaim - a.lastDailyClaim;
        });

      const globalTop = globalSorted.slice(0, 5);

      let groupMembers = [];
      const participantIDs = Object.entries(store.users || {})
        .filter(([id, u]) => u.groupMessages && u.groupMessages[threadId])
        .map(([id]) => id);

      if (participantIDs && participantIDs.length > 0) {
        groupMembers = participantIDs.map(id => {
          const u = store.users[id] || { dailyStreak: 0, lastDailyClaim: 0 };
          return { id, dailyStreak: u.dailyStreak || 0, lastDailyClaim: u.lastDailyClaim || 0 };
        })
        .sort((a, b) => {
          if (b.dailyStreak !== a.dailyStreak) return b.dailyStreak - a.dailyStreak;
          return b.lastDailyClaim - a.lastDailyClaim;
        })
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
        return `${medals[i]} ${name} — 🔥 ${u.dailyStreak} dni`;
      })
    );

    const groupLines = await Promise.all(
      groupMembers.map(async (u, i) => {
        let name = await getName(u.id);
        if (showIds.includes(u.id)) {
          name = `${name} ${u.id}`;
        }
        return `${medals[i]} ${name} — 🔥 ${u.dailyStreak} dni`;
      })
    );

    const responseText = 
      `📅 **Ranking Daily**\n` +
      `🌍 **Top 5 Global**\n` +
      `${globalLines.length ? globalLines.join('\n') : 'Brak danych.'}\n` +
      `👥 **Top 5 Grupy**\n` +
      `${groupLines.length ? groupLines.join('\n') : 'Brak danych grupowych.'}`;

    await message.reply(responseText);
  }
};
