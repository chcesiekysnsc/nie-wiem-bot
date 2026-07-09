const { formatNumber, formatCurrency } = require('../utils/economy');
const { withData, createUser } = require('../utils/storage');

module.exports = {
  name: 'top',
  aliases: ['ranking', 'topmsg'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    const sub = String(args[0] || '').trim().toLowerCase();

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
          console.error('[TOP] Preload error:', err);
        }
      }
    }

    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];

    if (sub === 'wiadomosci' || sub === 'wiadomości' || sub === 'msg') {
      const topUsers = await withData(store => {
        return Object.entries(store.users || {})
          .map(([id, u]) => {
            const count = (u.groupMessages && u.groupMessages[threadId]) || 0;
            return { id, count };
          })
          .filter(u => u.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      });

      await preloadNames(topUsers.map(u => u.id));

      const medals10 = ['🥇', '🥈', '🥉', '4.', '5.', '6.', '7.', '8.', '9.', '10.'];
      const lines = await Promise.all(
        topUsers.map(async (u, i) => {
          const name = await getName(u.id);
          return `${medals10[i]} **${name}** — ${formatNumber(u.count)} wiadomości`;
        })
      );

      const responseText = 
        `🏆 **Ranking Wiadomości na tej grupie (Top 10)**\n` +
        `${lines.length ? lines.join('\n') : 'Brak danych o wiadomościach na tej grupie.'}`;

      await message.reply(responseText);
      return;
    }

    if (sub === 'global' || sub === 'topmsg') {
      const topUsers = await withData(store => {
        return Object.entries(store.users || {})
          .map(([id, u]) => ({
            id,
            count: u.messageCount || 0
          }))
          .filter(u => u.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      });

      await preloadNames(topUsers.map(u => u.id));

      const medals10 = ['🥇', '🥈', '🥉', '4.', '5.', '6.', '7.', '8.', '9.', '10.'];
      const lines = await Promise.all(
        topUsers.map(async (u, i) => {
          const name = await getName(u.id);
          return `${medals10[i]} **${name}** — ${formatNumber(u.count)} wiadomości`;
        })
      );

      const responseText = 
        `🌍 **Ranking Wiadomości Globalny (Top 10)**\n` +
        `${lines.length ? lines.join('\n') : 'Brak danych o wiadomościach globalnie.'}`;

      await message.reply(responseText);
      return;
    }

    if (sub === 'gang' || sub === 'gangi' || sub === 'ganki') {
      const gangsList = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        return Object.values(store.profiles.gangs).map(g => ({
          name: g.name,
          bossId: g.bossId,
          vault: g.vault || 0
        }));
      });

      const sortedGangs = gangsList
        .sort((a, b) => b.vault - a.vault)
        .slice(0, 3);

      await preloadNames(sortedGangs.map(g => g.bossId));

      const lines = await Promise.all(
        sortedGangs.map(async (g, i) => {
          const bossName = await getName(g.bossId);
          return `${medals[i]} **${g.name}** (Boss: **${bossName}**) — ${formatCurrency(g.vault)}`;
        })
      );

      const responseText = 
        `🏆 **Ranking Gangów (Top 3)**\n` +
        `${lines.length ? lines.join('\n') : 'Brak zarejestrowanych gangów.'}`;

      await message.reply(responseText);
      return;
    }

    if (sub === 'femboy' || sub === 'femboyow' || sub === 'femboyów') {
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

      if (!participantIDs || participantIDs.length === 0) {
        participantIDs = await withData(store => {
          return Object.entries(store.users || {})
            .filter(([id, u]) => u.groupMessages && u.groupMessages[threadId])
            .map(([id]) => id);
        });
      }

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
      const eligible = participantIDs.filter(id => id !== botId);

      const subadmins = ['100089655356822', '61554894353095', '100053875564339'];
      const femboys = eligible.map(id => {
        let percentage;
        if (subadmins.includes(id)) {
          percentage = 101;
        } else {
          let hash = 0;
          for (let j = 0; j < id.length; j++) {
            hash = (hash << 5) - hash + id.charCodeAt(j);
            hash |= 0;
          }
          percentage = Math.abs(hash) % 101;
        }
        return { id, percentage };
      });

      const sortedFemboys = femboys
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5);

      await preloadNames(sortedFemboys.map(f => f.id));

      const lines = await Promise.all(
        sortedFemboys.map(async (f, i) => {
          const name = await getName(f.id);
          return `${medals[i]} **${name}** — **${f.percentage}%**`;
        })
      );

      const responseText = 
        `🌈 **Top 5 Największych Femboyów na tej grupie**\n\n` +
        `${lines.length ? lines.join('\n') : 'Brak osób do stworzenia rankingu.'}`;

      await message.reply(responseText);
      return;
    }

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

      // Wszystkie konta posortowane globalnie
      const globalSorted = users
        .map(([id, u]) => {
          const borrowed = u.activeLoan ? u.activeLoan.originalAmount : 0;
          return { id, balance: (u.balance || 0) - borrowed + (u.bank || 0) };
        })
        .sort((a, b) => b.balance - a.balance);

      const totalPlayers = globalSorted.length;
      const myRank = globalSorted.findIndex(u => u.id === message.author.id) + 1;

      // Top 5 Globalnie (najwięcej monet ze wszystkich zarejestrowanych)
      const globalTop = globalSorted.slice(0, 5);

      // Top 5 Grupy (najbardziej majętni ludzie na danej grupie)
      let groupMembers = [];
      if (participantIDs && participantIDs.length > 0) {
        // Mapujemy wszystkich uczestników grupy - jeśli nie ma ich w bazie, dajemy domyślny balans startowy (15 000)
        groupMembers = participantIDs.map(id => {
          const u = store.users[id] || { balance: 5000, bank: 10000 };
          const borrowed = u.activeLoan ? u.activeLoan.originalAmount : 0;
          return { id, balance: (u.balance || 0) - borrowed + (u.bank || 0) };
        })
        .sort((a, b) => b.balance - a.balance)
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
      `${groupLines.length ? groupLines.join('\n') : 'Brak danych grupowych.'}\n\n` +
      `🌎 Jesteś **${myRank}** z **${totalPlayers}** graczy.`;

    await message.reply(responseText);
  }
};
