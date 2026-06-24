const { formatNumber } = require('../utils/economy');
const { withData, createUser } = require('../utils/storage');

module.exports = {
  name: 'toplvl',
  aliases: ['topl'],
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
        if (client.resolvedUserNames) {
          client.resolvedUserNames.add(id);
        }
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
          console.error('[TOPLVL] Preload error:', err);
        }
      }
    }

    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];

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

    const { globalTop, groupMembers, showIds, myRank, totalPlayers } = await withData(store => {
      // Upewnij się, że autor ma swój profil w bazie
      createUser(message.author.id, store.users);

      const users = Object.entries(store.users || {});
      const showIds = store.profiles.showIds || [];

      // Oblicz XP wymagane dla każdego poziomu
      const getRequiredXp = (level) => {
        return Math.floor(100 * Math.pow(1.5, level - 1));
      };

      // Wszystkie konta posortowane globalnie po levelu
      const globalSorted = users
        .map(([id, u]) => {
          const level = u.level || 1;
          const xp = u.xp || 0;
          const requiredXp = getRequiredXp(level);
          const xpToNext = requiredXp - xp;
          return { id, level, xp, xpToNext };
        })
        .sort((a, b) => b.level - a.level || b.xp - a.xp);

      const totalPlayers = globalSorted.length;
      const myRank = globalSorted.findIndex(u => u.id === message.author.id) + 1;

      // Top 5 Globalnie (najwyższy poziom)
      const globalTop = globalSorted.slice(0, 5);

      // Top 5 Grupy (najwyższy poziom na danej grupie)
      let groupMembers = [];
      if (participantIDs && participantIDs.length > 0) {
        groupMembers = participantIDs.map(id => {
          const u = store.users[id] || { level: 1, xp: 0 };
          const level = u.level || 1;
          const xp = u.xp || 0;
          const requiredXp = getRequiredXp(level);
          const xpToNext = requiredXp - xp;
          return { id, level, xp, xpToNext };
        })
        .sort((a, b) => b.level - a.level || b.xp - a.xp)
        .slice(0, 5);
      } else {
        // Fallback: Pokazujemy zarejestrowanych użytkowników
        groupMembers = globalSorted.slice(0, 5);
      }

      return { globalTop, groupMembers, showIds, myRank, totalPlayers };
    });

    const allTopIds = [...new Set([...globalTop.map(u => u.id), ...groupMembers.map(u => u.id)])];
    await preloadNames(allTopIds);

    const globalLines = await Promise.all(
      globalTop.map(async (u, i) => {
        let name = await getName(u.id);
        if (showIds.includes(u.id)) {
          name = `${name} ${u.id}`;
        }
        const xpText = u.xpToNext > 0 ? ` (${formatNumber(u.xpToNext)} XP do ${u.level + 1})` : '';
        return `${medals[i]} ${name} — Level ${u.level}${xpText}`;
      })
    );

    const groupLines = await Promise.all(
      groupMembers.map(async (u, i) => {
        let name = await getName(u.id);
        if (showIds.includes(u.id)) {
          name = `${name} ${u.id}`;
        }
        const xpText = u.xpToNext > 0 ? ` (${formatNumber(u.xpToNext)} XP do ${u.level + 1})` : '';
        return `${medals[i]} ${name} — Level ${u.level}${xpText}`;
      })
    );

    const responseText = 
      `🏆 **Ranking Poziomów**\n` +
      `🌍 **Top 5 Global**\n` +
      `${globalLines.length ? globalLines.join('\n') : 'Brak danych.'}\n` +
      `👥 **Top 5 Grupy**\n` +
      `${groupLines.length ? groupLines.join('\n') : 'Brak danych grupowych.'}\n\n` +
      `🌎 Jesteś **${myRank}** z **${totalPlayers}** graczy.`;

    await message.reply(responseText);
  }
};
