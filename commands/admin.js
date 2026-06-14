const fs = require('fs');
const https = require('https');
const path = require('path');
const config = require('../config/config');

function getCookieString() {
  try {
    const appState = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'appstate.json'), 'utf8'));
    return appState.map(c => `${c.key}=${c.value}`).join('; ');
  } catch (err) {
    console.error('[ADMIN-CMD] Error reading appstate.json:', err);
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
  name: 'admin',
  aliases: [],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ Brak połączenia z API Messengera.');
      return;
    }

    const mode = String(args[0] || '').toLowerCase();
    if (mode !== 'give' && mode !== 'del') {
      await message.reply('❌ Użyj: **!admin give @osoba** lub **!admin del @osoba**');
      return;
    }

    const targetArg = args.slice(1).join(' ');
    if (!targetArg) {
      await message.reply(`❌ Podaj kogo chcesz oznaczyć, podać ID lub link: **!admin ${mode} @osoba**`);
      return;
    }

    try {
      // 1. Pobierz informacje o wątku grupowym
      const info = await new Promise((resolve, reject) => {
        client.api.getThreadInfo(threadId, (err, ret) => {
          if (err) return reject(err);
          resolve(ret);
        });
      });

      if (!info) {
        await message.reply('❌ Błąd podczas pobierania informacji o grupie.');
        return;
      }

      // 2. Pobierz ID administratorów grupy
      const adminIDs = (info.adminIDs || []).map(admin => {
        if (typeof admin === 'object' && admin !== null) {
          return admin.id || admin.userID;
        }
        return admin;
      }).filter(Boolean);

      const botId = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';

      // 3. Sprawdź czy bot jest adminem grupy
      const isBotAdmin = adminIDs.includes(botId);
      if (!isBotAdmin) {
        await message.reply('❌ Bot nie jest administratorem tej grupy! Musisz najpierw nadać botowi admina w grupie, aby mógł zarządzać uprawnieniami innych.');
        return;
      }

      // 4. Sprawdź czy nadawca jest adminem grupy lub adminem bota
      const isSenderAdmin = adminIDs.includes(message.author.id) || config.admins.includes(message.author.id);
      if (!isSenderAdmin) {
        await message.reply('❌ Tylko administratorzy tej grupy lub bota mogą używać tej komendy.');
        return;
      }

      // 5. Rozpoznaj cel (target)
      let targetId = null;
      let targetName = 'Użytkownik';

      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
        targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
      } else {
        const parsed = parseFBInput(targetArg);
        if (parsed.type === 'id') {
          targetId = parsed.value;
        } else {
          const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
          try {
            targetId = await resolveUIDFromUsername(parsed.value);
          } catch (resolveErr) {
            console.error('[ADMIN] Błąd pobierania UID:', resolveErr);
            await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
            return;
          }
        }
      }

      if (!targetId || !/^\d+$/.test(targetId)) {
        await message.reply(`❌ Nie udało się zidentyfikować użytkownika. Użyj: **!admin ${mode} @osoba**`);
        return;
      }

      // Pobierz imię celu
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

      const shouldBeAdmin = mode === 'give';

      // Sprawdź czy zmiana jest potrzebna
      const isTargetAlreadyAdmin = adminIDs.includes(targetId);
      if (shouldBeAdmin && isTargetAlreadyAdmin) {
        await message.reply(`👑 **${targetName}** jest już administratorem tej grupy.`);
        return;
      }
      if (!shouldBeAdmin && !isTargetAlreadyAdmin) {
        await message.reply(`ℹ️ **${targetName}** nie jest administratorem tej grupy.`);
        return;
      }

      // 6. Wywołaj zmianę statusu admina
      await new Promise((resolve, reject) => {
        client.api.changeAdminStatus(threadId, targetId, shouldBeAdmin, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      if (shouldBeAdmin) {
        await message.reply(`👑 Pomyślnie mianowano **${targetName}** administratorem grupy.`);
      } else {
        await message.reply(`✅ Pomyślnie odebrano uprawnienia administratora grupowego dla **${targetName}**.`);
      }

    } catch (err) {
      console.error('[ADMIN-CMD] Błąd podczas zmiany uprawnień administratora:', err);
      await message.reply(`❌ Błąd podczas modyfikowania uprawnień. (Facebook może blokować tę operację ze względów bezpieczeństwa).`);
    }
  }
};
