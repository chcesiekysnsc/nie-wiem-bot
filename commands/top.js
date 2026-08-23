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
          vault: g.vault || 0,
          members: g.members || []
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

      let groupParticipantIDs = [];
      if (client.api && typeof client.api.getThreadInfo === 'function' && threadId) {
        try {
          groupParticipantIDs = await new Promise((resolve) => {
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

      let groupGangLines = [];
      if (groupParticipantIDs && groupParticipantIDs.length > 0) {
        const participantSet = new Set(groupParticipantIDs);
        const gangsWithMembersInGroup = gangsList
          .map(g => {
            const membersInGroup = (g.members || []).filter(id => participantSet.has(id)).length;
            return { ...g, membersInGroup };
          })
          .filter(g => g.membersInGroup > 0)
          .sort((a, b) => (b.vault || 0) - (a.vault || 0))
          .slice(0, 3);

        await preloadNames(gangsWithMembersInGroup.map(g => g.bossId));

        groupGangLines = await Promise.all(
          gangsWithMembersInGroup.map(async (g, i) => {
            const bossName = await getName(g.bossId);
            return `${medals[i]} **${g.name}** (Boss: **${bossName}**, ${g.membersInGroup} członków na tej grp) — ${formatCurrency(g.vault)}`;
          })
        );
      }

      let responseText = 
        `🏆 **Ranking Gangów (Top 3 Globalnie)**\n` +
        `${lines.length ? lines.join('\n') : 'Brak zarejestrowanych gangów.'}`;

      if (groupGangLines.length > 0) {
        responseText += `\n\n👥 **Top 3 Gangów na tej grupie**\n`;
        responseText += groupGangLines.join('\n');
      } else if (groupParticipantIDs && groupParticipantIDs.length > 0) {
        responseText += `\n\n👥 **Top 3 Gangów na tej grupie**\n`;
        responseText += 'Brak gangów z członkami na tej grupie.';
      }

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

    if (sub === 'lvl' || sub === 'poziom' || sub === 'level') {
      const { globalTop, groupMembers, showIds, myRank, totalPlayers } = await withData(store => {
        createUser(message.author.id, store.users);

        const users = Object.entries(store.users || {});
        const showIds = store.profiles.showIds || [];

        const globalSorted = users
          .map(([id, u]) => {
            const prestige = u.prestige || 0;
            const level = u.level || 5;
            const effectiveLevel = level + prestige * 100;
            return { id, level, prestige, effectiveLevel, xp: u.xp || 0 };
          })
          .sort((a, b) => {
            if (b.effectiveLevel !== a.effectiveLevel) return b.effectiveLevel - a.effectiveLevel;
            return b.xp - a.xp;
          });

        const totalPlayers = globalSorted.length;
        const myRank = globalSorted.findIndex(u => u.id === message.author.id) + 1;

        const globalTop = globalSorted.slice(0, 5);

        let groupMembers = [];
        if (participantIDs && participantIDs.length > 0) {
          groupMembers = participantIDs.map(id => {
            const u = store.users[id] || { level: 5, prestige: 0, xp: 0 };
            const prestige = u.prestige || 0;
            const level = u.level || 5;
            const effectiveLevel = level + prestige * 100;
            return { id, level, prestige, effectiveLevel, xp: u.xp || 0 };
          })
          .sort((a, b) => {
            if (b.effectiveLevel !== a.effectiveLevel) return b.effectiveLevel - a.effectiveLevel;
            return b.xp - a.xp;
          })
          .slice(0, 5);
        } else {
          groupMembers = globalTop.slice(0, 5);
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
          const prestigeLabel = u.prestige > 0 ? ` [Prestiż ${u.prestige}]` : '';
          return `${medals[i]} ${name} — ${u.level}${prestigeLabel}`;
        })
      );

      const groupLines = await Promise.all(
        groupMembers.map(async (u, i) => {
          let name = await getName(u.id);
          if (showIds.includes(u.id)) {
            name = `${name} ${u.id}`;
          }
          const prestigeLabel = u.prestige > 0 ? ` [Prestiż ${u.prestige}]` : '';
          return `${medals[i]} ${name} — ${u.level}${prestigeLabel}`;
        })
      );

      const responseText =
        `🏆 **Ranking Poziomów**\n` +
        `🌍 **Top 5 Global**\n` +
        `${globalLines.length ? globalLines.join('\n') : 'Brak danych.'}\n` +
        `👥 **Top 5 Grupy**\n` +
        `${groupLines.length ? groupLines.join('\n') : 'Brak danych grupowych.'}`;

      await message.reply(responseText);
      return;
    }

    if (sub === 'daily' || sub === 'dzienny') {
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
          groupMembers = globalTop.slice(0, 5);
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
      createUser(message.author.id, store.users);

      const users = Object.entries(store.users || {});
      const showIds = store.profiles.showIds || [];

      const EXCLUDED_FROM_GLOBAL_TOP = '100060812419294';

      const globalSorted = users
        .filter(([id]) => id !== EXCLUDED_FROM_GLOBAL_TOP)
        .map(([id, u]) => {
          const borrowed = u.activeLoan ? u.activeLoan.originalAmount : 0;
          return { id, balance: (u.balance || 0) - borrowed + (u.bank || 0) };
        })
        .sort((a, b) => b.balance - a.balance);

      const totalPlayers = globalSorted.length;
      const myRank = globalSorted.findIndex(u => u.id === message.author.id) + 1;

      const globalTop = globalSorted.slice(0, 5);

      let groupMembers = [];
      if (participantIDs && participantIDs.length > 0) {
        groupMembers = participantIDs.map(id => {
          const u = store.users[id] || { balance: 5000, bank: 10000 };
          const borrowed = u.activeLoan ? u.activeLoan.originalAmount : 0;
          return { id, balance: (u.balance || 0) - borrowed + (u.bank || 0) };
        })
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);
      }

      return { globalTop, groupMembers, showIds, myRank, totalPlayers };
    });

    const isGroup = threadId && threadId !== (message.rawEvent?.senderID || message.author.id);

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

    let responseText = '';

    if (sub === 'global' || sub === 'topmsg') {
      responseText +=
        `🏆 **Ranking Kasynowy — Globalny**\n` +
        `${globalLines.length ? globalLines.join('\n') : 'Brak danych.'}\n\n` +
        `🌎 Jesteś **${myRank}** z **${totalPlayers}** graczy.`;
    } else {
      const showGlobal = threadId
        ? true
        : true;

      if (showGlobal) {
        responseText +=
          `🏆 **Ranking Kasynowy**\n` +
          `🌍 **Top 5 Global**\n` +
          `${globalLines.length ? globalLines.join('\n') : 'Brak danych.'}\n`;
      }

      if (groupLines.length > 0 && isGroup) {
        responseText +=
          `👥 **Top 5 Grupy**\n` +
          `${groupLines.join('\n')}\n`;
      } else if (showGlobal) {
        responseText += `\n👥 Brak danych grupowych.\n`;
      }

      responseText += `\n🌎 Jesteś **${myRank}** z **${totalPlayers}** graczy.`;
    }

    await message.reply(responseText);
  }
};
