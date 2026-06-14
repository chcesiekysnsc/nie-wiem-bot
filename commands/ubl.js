const fs = require('fs');
const https = require('https');
const path = require('path');
const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');

function getCookieString() {
  try {
    const appState = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'appstate.json'), 'utf8'));
    return appState.map(c => `${c.key}=${c.value}`).join('; ');
  } catch (err) {
    console.error('[UBL] Error reading appstate.json:', err);
    return '';
  }
}

function parseFBInput(input) {
  input = input.trim();
  
  if (/^\d+$/.test(input)) {
    return { type: 'id', value: input };
  }
  
  try {
    let urlString = input;
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = 'https://' + urlString;
    }
    const parsedUrl = new URL(urlString);
    
    if (/(?:^|\.)facebook\.com$/i.test(parsedUrl.hostname)) {
      if (parsedUrl.pathname === '/profile.php') {
        const id = parsedUrl.searchParams.get('id');
        if (id && /^\d+$/.test(id)) {
          return { type: 'id', value: id };
        }
      }
      
      const pathParts = parsedUrl.pathname.split('/').filter(p => p.length > 0);
      if (pathParts.length > 0) {
        const username = pathParts[0];
        const nonUsernames = ['groups', 'pages', 'events', 'messages', 'notifications', 'settings', 'friends', 'marketplace'];
        if (!nonUsernames.includes(username.toLowerCase())) {
          return { type: 'username', value: username };
        }
      }
    }
  } catch (err) {}
  
  return { type: 'username', value: input };
}

function resolveUIDFromUsername(username) {
  return new Promise((resolve, reject) => {
    const cookieStr = getCookieString();
    const url = `https://www.facebook.com/${username}`;
    const options = {
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1'
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Błąd serwera Facebook (HTTP ${res.statusCode})`));
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const escapedUsername = username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const vanityRegex = new RegExp(`"userVanity"\\s*:\\s*"${escapedUsername}"\\s*,\\s*"userID"\\s*:\\s*"(\\d+)"`, 'i');
        const vanityMatch = data.match(vanityRegex);
        if (vanityMatch && vanityMatch[1]) {
          return resolve(vanityMatch[1]);
        }

        const userIdRegex = /"userID"\s*:\s*"(\d+)"/g;
        let m;
        const matchedIds = [];
        while ((m = userIdRegex.exec(data)) !== null) {
          matchedIds.push(m[1]);
        }
        
        const viewerIdRegex = /"viewerID"\s*:\s*"(\d+)"/;
        const viewerIdMatch = data.match(viewerIdRegex);
        const viewerId = viewerIdMatch ? viewerIdMatch[1] : null;

        const candidateIds = matchedIds.filter(id => id !== viewerId);
        if (candidateIds.length > 0) {
          return resolve(candidateIds[0]);
        }

        const fbProfileRegex = /"profileID"\s*:\s*"(\d+)"/;
        const fbProfileMatch = data.match(fbProfileRegex);
        if (fbProfileMatch && fbProfileMatch[1] && fbProfileMatch[1] !== viewerId) {
          return resolve(fbProfileMatch[1]);
        }

        reject(new Error(`Nie odnaleziono ID użytkownika dla nazwy profilu: ${username}`));
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  name: 'ubl',
  aliases: ['ybl', 'unbl', 'unblacklist'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    if (!args[0]) {
      await message.reply('❌ Podaj ID/oznacz osobę lub podaj numer/ID grupy: **!ubl @osoba**, **!ubl <id_uzytkownika>** lub **!ubl <nr_grupy>**');
      return;
    }

    const input = args[0].trim();
    const threadIds = Array.from(client.activeThreadIds || []).sort();

    // Sprawdzamy czy podano poprawny indeks grupy z listy
    const index = parseInt(input, 10);
    let targetGroupId = null;
    if (!isNaN(index) && index >= 1 && index <= threadIds.length) {
      targetGroupId = threadIds[index - 1];
    } else {
      // Sprawdzamy czy podane ID jest obecnie na liście zablokowanych grup
      const isGroupBanned = await withData(store => {
        return (store.profiles.blacklistedGroups || []).includes(input);
      });
      if (isGroupBanned) {
        targetGroupId = input;
      }
    }

    if (targetGroupId) {
      const result = await withData(store => {
        if (!store.profiles.blacklistedGroups) store.profiles.blacklistedGroups = [];
        const idx = store.profiles.blacklistedGroups.indexOf(targetGroupId);
        if (idx === -1) {
          return { notFound: true };
        }
        store.profiles.blacklistedGroups.splice(idx, 1);
        return { success: true };
      });

      if (result.notFound) {
        await message.reply(`👤 Grupa o ID **${targetGroupId}** nie znajduje się na czarnej liście.`);
        return;
      }

      await message.reply(`✅ Pomyślnie odblokowano grupę o ID **${targetGroupId}**. Bot ponownie będzie na niej odpowiadać.`);
      return;
    }

    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0]) {
      const input = args.join(' ');
      const parsed = parseFBInput(input);
      if (parsed.type === 'id') {
        targetId = parsed.value;
      } else {
        const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
        try {
          targetId = await resolveUIDFromUsername(parsed.value);
        } catch (resolveErr) {
          console.error('[UBL] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }
    }

    if (!targetId || !/^\d+$/.test(targetId)) {
      await message.reply('❌ Podaj ID, oznacz osobę lub podaj link do profilu: **!ubl @osoba**, **!ubl <id>** lub **!ubl <link>**');
      return;
    }

    if (client.userNames.has(targetId)) {
      targetName = client.userNames.get(targetId);
    } else {
      try {
        const resolvedName = await client.resolveUserName(client.api, targetId);
        if (resolvedName && !resolvedName.startsWith('Użytkownik_')) {
          targetName = resolvedName;
        } else {
          targetName = `Uzytkownik_${targetId.slice(-6)}`;
        }
      } catch (_) {
        targetName = `Uzytkownik_${targetId.slice(-6)}`;
      }
    }

    const restrictedAdmins = ['100089655356822', '61554894353095', '100053875564339'];

    const result = await withData(store => {
      if (!store.profiles.blacklist) store.profiles.blacklist = [];
      const idx = store.profiles.blacklist.indexOf(targetId);

      // Sprawdź czy użytkownik ma aktywny tymczasowy ban za spam
      const hasSpamBan = store.cooldowns.spam[targetId] 
        && typeof store.cooldowns.spam[targetId] === 'object'
        && store.cooldowns.spam[targetId].blockedUntil > Date.now();

      if (idx === -1 && !hasSpamBan) {
        return { notFound: true };
      }

      if (idx !== -1) {
        // Blokada za ujemne saldo — NIKT (nawet twórca) nie może zdjąć
        const targetUser = store.users[targetId];
        if (targetUser && targetUser.blacklistedForNegativeBalance) {
          return { isNegativeBalanceBl: true };
        }

        // Sprawdź czy target jest na twardej czarnej liście (tylko twórca może go zdjąć)
        if (store.profiles.trueBlacklist && store.profiles.trueBlacklist.includes(targetId)) {
          if (message.author.id !== '100060812419294') {
            return { isTrueBlRestricted: true };
          }
        }

        store.profiles.blacklist.splice(idx, 1);
        if (store.profiles.trueBlacklist) {
          const trueIdx = store.profiles.trueBlacklist.indexOf(targetId);
          if (trueIdx !== -1) {
            store.profiles.trueBlacklist.splice(trueIdx, 1);
          }
        }
      }

      // Wyczyść tymczasowy ban za spam
      if (store.cooldowns.spam[targetId]) {
        delete store.cooldowns.spam[targetId];
      }

      // Wyczyść licznik ostrzeżeń za spam
      if (store.profiles.spamWarnings && store.profiles.spamWarnings[targetId]) {
        delete store.profiles.spamWarnings[targetId];
      }

      // Wyczyść powiadomienia o cooldownie
      if (store.cooldowns.cooldownNotifications && store.cooldowns.cooldownNotifications[targetId]) {
        delete store.cooldowns.cooldownNotifications[targetId];
      }

      return { success: true, wasOnBlacklist: idx !== -1, hadSpamBan: hasSpamBan };
    });

    if (result.notFound) {
      await message.reply(`👤 **${targetName}** nie znajduje się na czarnej liście ani nie ma aktywnego bana za spam.`);
      return;
    }

    if (result.isNegativeBalanceBl) {
      await message.reply(`❌ Tej blokady nie można zdjąć — **${targetName}** został zablokowany automatycznie za zbyt długie ujemne saldo. Blokada jest trwała.`);
      return;
    }

    if (result.isTrueBlRestricted) {
      await message.reply(`❌ Nie posiadasz uprawnień do usuwania tego użytkownika z czarnej listy (został zablokowany przez twórcę).`);
      return;
    }

    let replyMsg = '';
    if (result.wasOnBlacklist && result.hadSpamBan) {
      replyMsg = `✅ Usunięto **${targetName}** z czarnej listy i wyczyszczono tymczasowy ban za spam.`;
    } else if (result.wasOnBlacklist) {
      replyMsg = `✅ Usunięto **${targetName}** z czarnej listy.`;
    } else {
      replyMsg = `✅ Wyczyszczono tymczasowy ban za spam dla **${targetName}**.`;
    }
    await message.reply(replyMsg);
  }
};

