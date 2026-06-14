const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'checkspam',
  aliases: ['spamskan', 'spamcheck'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Brak uprawnień do tej komendy. Tylko twórca może jej używać.');
      return;
    }

    if (!client.api) {
      await message.reply('❌ API nie jest dostępne.');
      return;
    }

    await message.reply('🔍 Rozpoczynam ręczne skanowanie folderów Spam (Pending) oraz Inne (Other) w poszukiwaniu nowych grup...');

    const processedGroupsPath = path.join(__dirname, '../data/processed_groups.json');
    client.processedNewGroups = client.processedNewGroups || new Set();

    let newGroupsFound = 0;
    let pendingProcessed = false;
    let otherProcessed = false;

    function saveProcessedGroups() {
      try {
        fs.writeFileSync(processedGroupsPath, JSON.stringify(Array.from(client.processedNewGroups), null, 2), 'utf8');
      } catch (err) {
        console.error('[CHECKSPAM] Failed to save processed groups:', err);
      }
    }

    function processThreadList(err, list, folderName) {
      if (err) {
        console.error(`[CHECKSPAM] Error fetching ${folderName} threads:`, err);
        return;
      }

      if (!list || !Array.isArray(list)) return;

      for (const thread of list) {
        const isGroup = thread.isGroup === true || thread.threadType === 'GROUP';
        if (isGroup && thread.threadID) {
          if (!client.processedNewGroups.has(thread.threadID)) {
            client.processedNewGroups.add(thread.threadID);
            newGroupsFound++;

            // 1. Send welcome message
            const welcomeMsg = "dziekuje za dodanie na grupe, moj prefix to ! po wiecej informacji wpisz !help";
            client.api.sendMessage(welcomeMsg, thread.threadID, (sendErr) => {
              if (sendErr) {
                console.error(`[CHECKSPAM] welcome error for ${thread.threadID}:`, sendErr);
              }
            });

            // 2. Send monitoring notification
            const notifyGroupId = '24956371943963938';
            const notifyMsg = `🔔 **BOT ODNALAZŁ GRUPĘ W ${folderName.toUpperCase()}** 🔔\n` +
                              `👥 Nazwa: **${thread.name || "Bez nazwy"}**\n` +
                              `🆔 ID: \`${thread.threadID}\``;
            client.api.sendMessage(notifyMsg, notifyGroupId, (notifyErr) => {
              if (notifyErr) {
                console.error(`[CHECKSPAM] notify error:`, notifyErr);
              }
            });
          }
        }
      }
    }

    // Call PENDING
    client.api.getThreadList(100, null, ['PENDING'], (err1, list1) => {
      processThreadList(err1, list1, 'Spam (Pending)');
      pendingProcessed = true;
      checkFinished();
    });

    // Call OTHER
    client.api.getThreadList(100, null, ['OTHER'], (err2, list2) => {
      processThreadList(err2, list2, 'Inne (Other)');
      otherProcessed = true;
      checkFinished();
    });

    function checkFinished() {
      if (pendingProcessed && otherProcessed) {
        if (newGroupsFound > 0) {
          saveProcessedGroups();
          message.reply(`✅ Skanowanie zakończone! Odnaleziono i aktywowano **${newGroupsFound}** nowych grup.`);
        } else {
          message.reply('✅ Skanowanie zakończone. Nie znaleziono żadnych nowych grup w folderach Spam/Inne.');
        }
      }
    }
  }
};
