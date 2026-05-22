const config = require('../config/config');
const { formatCurrency } = require('../utils/economy');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'grp',
  aliases: ['groups', 'listgrp'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    const threadIds = Array.from(client.activeThreadIds || []).sort();

    if (threadIds.length === 0) {
      await message.reply('ℹ️ Bot nie ma zapisanego żadnego wątku w historii.');
      return;
    }

    await message.reply('⏳ Pobieranie informacji o grupach, w których bot jest obecny...');

    const botID = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : null;

    const threadDataPromises = threadIds.map(async (threadId) => {
      if (!client.api || typeof client.api.getThreadInfo !== 'function') {
        return null;
      }

      try {
        const info = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 3000);
          client.api.getThreadInfo(threadId, (err, ret) => {
            clearTimeout(timer);
            if (err) resolve(null);
            else resolve(ret);
          });
        });

        if (!info) return null;

        // Sprawdzamy czy to jest grupa oraz czy bot w niej uczestniczy
        const isGroup = info.isGroup === true;
        const participantIDs = info.participantIDs || [];
        const isBotPresent = botID ? participantIDs.includes(botID) : true;

        if (!isGroup || !isBotPresent) {
          return null;
        }

        // Obliczanie łącznych funduszy w grupie na podstawie profilów w bazie danych
        const { totalMoney, isBanned } = await withData(store => {
          const blacklisted = store.profiles.blacklistedGroups || [];
          const isBanned = blacklisted.includes(threadId);

          const defaultUser = config.economy.defaultUser || { balance: 5000, bank: 10000 };
          let total = 0;
          for (const pId of participantIDs) {
            const u = store.users[pId] || defaultUser;
            total += (u.balance || 0) + (u.bank || 0);
          }
          return { totalMoney: total, isBanned };
        });

        return {
          id: threadId,
          name: info.threadName || info.name || `Grupa [${threadId}]`,
          totalMoney,
          isBanned
        };
      } catch (err) {
        console.error(`[grp] Błąd pobierania info dla wątku ${threadId}:`, err.message);
        return null;
      }
    });

    const resolvedThreads = (await Promise.all(threadDataPromises)).filter(Boolean);

    if (resolvedThreads.length === 0) {
      await message.reply('ℹ️ Bot nie jest obecnie obecny w żadnej grupie.');
      return;
    }

    // Dynamicznie aktualizujemy activeThreadIds w pamięci i w pliku, by zachować tylko te obecne grupy
    const currentActiveThreads = resolvedThreads.map(t => t.id);
    client.activeThreadIds = new Set(currentActiveThreads);
    try {
      const path = require('path');
      const fs = require('fs');
      const activeThreadsPath = path.join(__dirname, '..', 'data', 'active_threads.json');
      fs.writeFileSync(activeThreadsPath, JSON.stringify(currentActiveThreads, null, 2), 'utf8');
    } catch (e) {
      console.error('[grp] Błąd zapisu active_threads.json:', e);
    }

    let response = '📊 **LISTA GRUP (w których bot jest obecny)**:\n\n';
    resolvedThreads.forEach((data, index) => {
      const banIndicator = data.isBanned ? ' 🚫 [ZABLOKOWANA]' : '';
      response += `**${index + 1}.** ${data.name}\n`;
      response += `   • ID: \`${data.id}\`${banIndicator}\n`;
      response += `   • Łącznie pieniędzy: **${formatCurrency(data.totalMoney)}**\n\n`;
    });

    await message.reply(response);
  }
};
