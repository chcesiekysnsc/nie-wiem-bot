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
    function get(url) {
      https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return get(response.headers.location);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
        file.on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }
    get(url);
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
    let avatarUrl = `https://graph.facebook.com/${targetId}/picture?width=500&height=500`;

    if (client.api) {
      if (typeof client.api.getUserInfo === 'function') {
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
            if (userInfo.thumbSrc) {
              avatarUrl = userInfo.thumbSrc;
            }
          }
        } catch (_) {}
      }

      if (typeof client.api.httpPost === 'function') {
        try {
          const highResUrl = await new Promise((resolve) => {
            const myUid = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : '';
            const form = {
              av: myUid,
              fb_api_caller_class: 'RelayModern',
              fb_api_req_friendly_name: 'CometHovercardQueryRendererQuery',
              server_timestamps: true,
              doc_id: '24418640587785718',
              variables: JSON.stringify({
                actionBarRenderLocation: "WWW_COMET_HOVERCARD",
                context: "DEFAULT",
                entityID: targetId,
                scale: 4,
                __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false
              })
            };

            client.api.httpPost('https://www.facebook.com/api/graphql/', form, (err, resText) => {
              if (err) return resolve(null);
              try {
                const cleanText = String(resText || '').replace('for (;;);', '');
                const res = JSON.parse(cleanText);
                const uri = res?.data?.node?.comet_hovercard_renderer?.user?.profile_picture?.uri;
                resolve(uri || null);
              } catch (_) {
                resolve(null);
              }
            });
          });
          if (highResUrl) {
            avatarUrl = highResUrl;
          }
        } catch (_) {}
      }
    }

    if (client.userNames.has(targetId)) {
      username = client.userNames.get(targetId);
    }

    const { globalRank, profileData } = await withData(store => {
      const user = createUser(targetId, store.users);
      refreshBadges(user, ensureInventoryRecord(store.inventory, targetId));

      const sortedUsers = Object.entries(store.users || {})
        .map(([id, u]) => ({ id, balance: (u.balance || 0) + (u.bank || 0) }))
        .sort((a, b) => b.balance - a.balance);

      const rankIndex = sortedUsers.findIndex(u => u.id === targetId);

      const threadId = message.guild?.id || message.rawEvent?.threadID;
      const groupSpecificCount = (user.groupMessages && user.groupMessages[threadId]) || 0;

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
          commandsUsed: user.commandsUsed || 0,
          messageCount: user.messageCount || 0,
          groupSpecificCount
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

    // Dodaj odznakę TWORCA (zawsze pierwsza w kolejnosci)
    if (targetId === '100060812419294') {
      profileData.badges.unshift('🛠️ TWÓRCA');
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
      `💬 Wiadomości: **${formatNumber(profileData.messageCount)}** (**${formatNumber(profileData.groupSpecificCount)}** na tej grupie)\n` +
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
