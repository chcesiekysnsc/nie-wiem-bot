const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  formatNumber,
  refreshBadges
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

module.exports = {
  name: 'pfp',
  aliases: ['profile', 'awatar', 'profil'],
  async execute(client, message, args) {
    let targetId = message.author.id;

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
    } else if (args[0]) {
      const cleanId = args[0].replace(/[<@>]/g, '').trim();
      if (/^\d+$/.test(cleanId)) {
        targetId = cleanId;
      }
    }

    let username = `Uzytkownik_${targetId.slice(-6)}`;
    let avatarUrl = '';

    if (client.api && typeof client.api.getUserInfo === 'function') {
      try {
        const userInfo = await new Promise((resolve) => {
          client.api.getUserInfo(targetId, (err, ret) => {
            if (!err && ret && ret[targetId]) {
              const name = ret[targetId].name;
              client.userNames.set(targetId, name);
              resolve({ name, thumbSrc: ret[targetId].thumbSrc });
            } else {
              resolve(null);
            }
          });
        });
        if (userInfo) {
          username = userInfo.name;
          avatarUrl = userInfo.thumbSrc || '';
        }
      } catch (_) {}
    }

    if (!avatarUrl && client.userNames.has(targetId)) {
      username = client.userNames.get(targetId);
    }

    const { globalRank, profileData } = await withData(store => {
      const user = createUser(targetId, store.users);
      refreshBadges(user, ensureInventoryRecord(store.inventory, targetId));

      const sortedUsers = Object.entries(store.users || {})
        .map(([id, u]) => ({ id, balance: (u.balance || 0) + (u.bank || 0) }))
        .sort((a, b) => b.balance - a.balance);

      const rankIndex = sortedUsers.findIndex(u => u.id === targetId);

      return {
        globalRank: rankIndex !== -1 ? rankIndex + 1 : null,
        profileData: {
          balance: user.balance,
          bank: user.bank,
          level: user.level,
          gamesPlayed: user.gamesPlayed,
          wins: user.wins || 0,
          losses: user.losses || 0,
          badges: [...(user.badges || [])],
          marriedTo: user.marriedTo,
          commandsUsed: user.commandsUsed || 0
        }
      };
    });

    // Dodaj odznakę ADMIN
    if (config.admins.includes(targetId)) {
      profileData.badges.unshift('👑 ADMIN');
    }

    // Dodaj ekskluzywne odznaki dla Top 3 globalnie
    if (globalRank === 1) {
      profileData.badges.unshift('🥇 Top 1');
    } else if (globalRank === 2) {
      profileData.badges.unshift('🥈 Top 2');
    } else if (globalRank === 3) {
      profileData.badges.unshift('🥉 Top 3');
    }

    let partnerName = 'Brak';
    if (profileData.marriedTo) {
      partnerName = `Użytkownik_${profileData.marriedTo.slice(-6)}`;
      if (client.userNames.has(profileData.marriedTo)) {
        partnerName = client.userNames.get(profileData.marriedTo);
      }
    }

    const response = 
      `👤 **Profil: ${username}**\n` +
      `🆔 ID: \`${targetId}\`\n` +
      `👛 Portfel: ${formatCurrency(profileData.balance)} | 🏦 Bank: ${formatCurrency(profileData.bank)}\n` +
      `🎮 Gry: ${formatNumber(profileData.gamesPlayed)} | ⌨️ Komendy: ${formatNumber(profileData.commandsUsed)}\n` +
      `📈 Wygrane: **${formatNumber(profileData.wins)}** | 📉 Przegrane: **${formatNumber(profileData.losses)}**\n` +
      `🏆 Poziom: ${profileData.level}\n` +
      `💍 Małżeństwo: **${partnerName}**\n` +
      `🎖️ Odznaki: ${profileData.badges.length ? profileData.badges.join(', ') : 'Brak'}`;

    if (avatarUrl && client.api) {
      const tempFile = path.join(__dirname, `temp_${targetId}.jpg`);
      try {
        await downloadImage(avatarUrl, tempFile);
        client.api.sendMessage(
          {
            body: response,
            attachment: fs.createReadStream(tempFile)
          },
          message.guild.id,
          () => {
            fs.unlink(tempFile, () => {});
          },
          message.rawEvent.messageID
        );
        return;
      } catch (err) {
        console.error('[PFP] Błąd wysyłania ze zdjęciem profilowym:', err);
        fs.unlink(tempFile, () => {});
      }
    }

    await message.reply(response);
  }
};
