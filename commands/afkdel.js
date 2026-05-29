const config = require('../config/config');

// Helper to get thread info as promise
function getThreadInfo(api, threadID) {
  return new Promise((resolve, reject) => {
    api.getThreadInfo(threadID, (err, info) => {
      if (err) return reject(err);
      resolve(info);
    });
  });
}

// Helper to get thread history as promise with a safety timeout
function getThreadHistoryPage(api, threadID, amount, timestamp) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[AFKDEL] getThreadHistory timed out for thread ${threadID}`);
        resolve([]);
      }
    }, 10000); // 10 sekund limitu na odpowiedź od FB

    api.getThreadHistory(threadID, amount, timestamp, (err, history) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[AFKDEL] getThreadHistory error:', err);
        return resolve([]);
      }
      resolve(history || []);
    });
  });
}

module.exports = {
  name: 'afkdel',
  aliases: [],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId || threadId === message.author.id) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
      return;
    }

    const senderId = message.author.id;

    try {
      // 1. Pobierz informacje o grupie
      const info = await getThreadInfo(client.api, threadId);
      if (!info) {
        await message.reply('❌ Błąd podczas pobierania informacji o grupie.');
        return;
      }

      // Wyciągamy ID adminów grupowych
      const adminIDs = (info.adminIDs || []).map(admin => {
        if (typeof admin === 'object' && admin !== null) {
          return admin.id || admin.userID;
        }
        return admin;
      }).filter(Boolean);

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';

      // Sprawdź czy bot jest adminem
      const isBotAdminOfGroup = adminIDs.includes(botId);
      if (!isBotAdminOfGroup) {
        await message.reply('❌ Bot nie jest administratorem tej grupy i nie może wyrzucać nieaktywnych członków. Nadaj botowi rangę administratora.');
        return;
      }

      // Sprawdź czy nadawca jest adminem grupy lub bota
      const isSenderAdmin = adminIDs.includes(senderId) || config.admins.includes(senderId);
      if (!isSenderAdmin) {
        await message.reply('❌ Tylko administratorzy grupy lub bota mogą używać tej komendy.');
        return;
      }

      // Wyciągamy ID uczestników grupy
      const participantIDs = (info.participantIDs || []).map(p => {
        if (typeof p === 'object' && p !== null) {
          return p.id || p.userID;
        }
        return p;
      }).filter(Boolean);

      await message.reply('🔍 **Skanowanie aktywności w toku...**\nPobieram historię wiadomości z ostatnich 30 dni z serwerów Facebooka. Może to chwilę potrwać...');

      // 2. Pobierz historię wiadomości z ostatnich 30 dni
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const activeUsers = new Set();
      let oldestTimestamp = null;
      let keepFetching = true;
      let totalFetched = 0;

      while (keepFetching && totalFetched < 15000) { // Limit bezpieczeństwa na 15 000 wiadomości
        const history = await getThreadHistoryPage(client.api, threadId, 500, oldestTimestamp);
        if (!history || history.length === 0) {
          break;
        }

        totalFetched += history.length;
        let pageOldest = Infinity;

        for (const msg of history) {
          const ts = Number(msg.timestamp);
          if (ts < pageOldest) {
            pageOldest = ts;
          }
          if (ts >= thirtyDaysAgo) {
            if (msg.senderID) {
              activeUsers.add(msg.senderID.toString());
            }
          }
        }

        // Jeśli pobrano mniej niż rozmiar strony (500), osiągnięto początek historii grupy
        if (history.length < 500) {
          keepFetching = false;
        } else if (pageOldest < thirtyDaysAgo) {
          keepFetching = false;
        } else {
          oldestTimestamp = pageOldest;
        }
      }

      // 3. Wytypuj osoby do usunięcia
      // Odrzucamy: aktywne ID, samego bota, administratorów grupy, administratorów bota
      const toRemove = participantIDs.filter(userId => {
        const isBot = (userId === botId);
        const isGroupAdmin = adminIDs.includes(userId);
        const isGlobalAdmin = config.admins.includes(userId);
        const isActive = activeUsers.has(userId);

        return !isBot && !isGroupAdmin && !isGlobalAdmin && !isActive;
      });

      if (toRemove.length === 0) {
        await message.reply('✅ Skanowanie zakończone! Wszyscy obecni członkowie grupy (poza botami i adminami) wykazali aktywność w ciągu ostatnich 30 dni.');
        return;
      }

      await message.reply(`📉 Znaleziono **${toRemove.length}** nieaktywnych użytkowników (brak wiadomości przez 30 dni). Rozpoczynam usuwanie...`);

      let removedCount = 0;
      const removedNames = [];

      for (const userId of toRemove) {
        try {
          await new Promise((resolve, reject) => {
            client.api.removeUserFromGroup(userId, threadId, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });

          // Pobierz nazwę usuniętego użytkownika
          let name = `Użytkownik_${userId.slice(-6)}`;
          try {
            name = await client.resolveUserName(client.api, userId);
          } catch (_) {}

          removedNames.push(name);
          removedCount++;

          // Odczekaj 1 sekundę przed kolejnym kickiem, aby uniknąć limitów FB
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (removeErr) {
          console.error(`[AFKDEL] Blad podczas usuwania ${userId}:`, removeErr);
        }
      }

      if (removedCount > 0) {
        await message.reply(`✅ Pomyślnie usunięto **${removedCount}** nieaktywnych użytkowników:\n👉 **${removedNames.join(', ')}**`);
      } else {
        await message.reply('❌ Nie udało się usunąć żadnego z nieaktywnych użytkowników (możliwy błąd uprawnień).');
      }

    } catch (err) {
      console.error('[AFKDEL] Blad glowny komendy:', err);
      await message.reply('❌ Wystąpił błąd podczas wykonywania komendy afkdel.');
    }
  }
};
