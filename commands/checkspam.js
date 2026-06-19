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
    const foundGroups = [];
    let skippedPrivateCount = 0;
    const allFetchedThreads = [];

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
        // Collect thread metadata for debug logs
        allFetchedThreads.push({
          folder: folderName,
          threadID: thread.threadID || null,
          name: thread.name || null,
          isGroup: thread.isGroup,
          threadType: thread.threadType,
          participantCount: thread.participantIDs ? thread.participantIDs.length : 0,
          participantIDs: thread.participantIDs || []
        });

        // Flexible check: isGroup flag, threadType (string or number), or more than 2 participants
        const isGroup = thread.isGroup === true || 
                        thread.threadType === 'GROUP' || 
                        thread.threadType === 2 || 
                        thread.threadType === '2' || 
                        (thread.participantIDs && thread.participantIDs.length > 2);

        if (isGroup && thread.threadID) {
          const name = thread.name || "Bez nazwy";
          const id = thread.threadID;
          const memberCount = (thread.participantIDs) ? thread.participantIDs.length : 0;

          foundGroups.push({
            name,
            id,
            folder: folderName,
            memberCount
          });

          // Always try sending the welcome message to attempt activation/moving from spam
          const welcomeMsg = "dziekuje za dodanie na grupe, moj prefix to ! po wiecej informacji wpisz !help";
          client.api.sendMessage(welcomeMsg, id, (sendErr) => {
            if (sendErr) {
              console.error(`[CHECKSPAM] welcome error for ${id}:`, sendErr);
            }
          });

          if (!client.processedNewGroups.has(id)) {
            client.processedNewGroups.add(id);
            newGroupsFound++;

            // Send monitoring notification
            const notifyGroupId = '24956371943963938';
            const notifyMsg = `🔔 **BOT ODNALAZŁ GRUPĘ W ${folderName.toUpperCase()}** 🔔\n` +
                              `👥 Nazwa: **${name}**\n` +
                              `🆔 ID: \`${id}\`\n` +
                              `👥 Liczba osób: **${memberCount}**`;
            client.api.sendMessage(notifyMsg, notifyGroupId, (notifyErr) => {
              if (notifyErr) {
                console.error(`[CHECKSPAM] notify error:`, notifyErr);
              }
            });
          }
        } else {
          skippedPrivateCount++;
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
        // Save raw list of all checked threads to facilitate remote troubleshooting
        try {
          const debugPath = path.join(__dirname, '../data/spamcheck_debug.json');
          fs.writeFileSync(debugPath, JSON.stringify(allFetchedThreads, null, 2), 'utf8');
          console.log('[CHECKSPAM] Saved debugging logs to', debugPath);
        } catch (err) {
          console.error('[CHECKSPAM] Failed to save debug logs:', err);
        }

        if (newGroupsFound > 0) {
          saveProcessedGroups();
        }

        if (foundGroups.length > 0) {
          const listText = foundGroups.map(g => `• **${g.name}** (ID: \`${g.id}\`, Osoby: **${g.memberCount}**) w folderze *${g.folder}*`).join('\n');
          message.reply(`✅ **Skanowanie zakończone!**\n\nZnaleziono następujące grupy w Spam/Inne (wysłano ponowne powitanie w celu aktywacji):\n${listText}\n\n*(Pominięto ${skippedPrivateCount} czatów prywatnych)*`);
        } else {
          message.reply(`✅ Skanowanie zakończone. Nie znaleziono żadnych grup w folderach Spam/Inne. (Pominięto ${skippedPrivateCount} czatów prywatnych)`);
        }
      }
    }
  }
};
