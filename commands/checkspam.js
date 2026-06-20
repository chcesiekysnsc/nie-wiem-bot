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

    const subCommand = String(args[0] || '').toLowerCase();
    if (subCommand === 'restart' || subCommand === 'reset') {
      const activeGroupsCount = client.activeThreadIds ? client.activeThreadIds.size : 0;
      await message.reply(`🔄 Restartuję bota w celu odświeżenia połączeń MQTT... (Zresetowano na ${activeGroupsCount} grupach)`);
      setTimeout(() => {
        console.log('[CHECKSPAM] Manual restart triggered...');
        process.exit(1);
      }, 1000);
      return;
    }

    if (subCommand === 'debug') {
      const debugPath = path.join(__dirname, '../data/spamcheck_debug.json');
      if (!fs.existsSync(debugPath)) {
        await message.reply('❌ Brak pliku debugowania. Wykonaj najpierw standardowe skanowanie !spamcheck.');
        return;
      }
      
      try {
        const contentStr = fs.readFileSync(debugPath, 'utf8');
        const debugData = JSON.parse(contentStr);
        
        let reply = `📂 **LOG OSTATNIEGO SKANOWANIA**\n`;
        reply += `• Czas: \`${debugData.timestamp}\`\n`;
        reply += `• Błąd Pending: \`${debugData.pendingError || 'brak'}\`\n`;
        reply += `• Błąd Other: \`${debugData.otherError || 'brak'}\`\n`;
        reply += `• Liczba wątków: **${debugData.threads ? debugData.threads.length : 0}**\n\n`;
        
        if (!debugData.threads || debugData.threads.length === 0) {
          reply += `*Brak wątków do wyświetlenia.*`;
          await message.reply(reply);
          return;
        }

        reply += `📋 **Lista wątków (szczegóły):**\n`;
        for (let i = 0; i < debugData.threads.length; i++) {
          const t = debugData.threads[i];
          const threadDesc = `${i + 1}. Folder: *${t.folder}*\n` +
                             `   ID: \`${t.threadID}\`\n` +
                             `   Nazwa: **${t.name || 'Bez nazwy'}**\n` +
                             `   isGroup: \`${t.isGroup}\`, threadType: \`${t.threadType}\`\n` +
                             `   Osoby: **${t.participantCount}**\n\n`;
                             
          if (reply.length + threadDesc.length > 1900) {
            reply += `*(...i ${debugData.threads.length - i} więcej wątków - limit znaków)*`;
            break;
          }
          reply += threadDesc;
        }
        
        await message.reply(reply);
      } catch (err) {
        await message.reply(`❌ Błąd odczytu logów: \`${err.message || JSON.stringify(err)}\``);
      }
      return;
    }

    await message.reply('🔍 Rozpoczynam ręczne skanowanie wszystkich dostępnych folderów: Skrzynka (Inbox), Spam (Pending), Inne (Other) oraz Zarchiwizowane (Archived) w poszukiwaniu grup...');

    const processedGroupsPath = path.join(__dirname, '../data/processed_groups.json');
    const activeThreadsPath = path.join(__dirname, '../data/active_threads.json');
    
    client.processedNewGroups = client.processedNewGroups || new Set();
    client.activeThreadIds = client.activeThreadIds || new Set();

    let newGroupsFound = 0;
    let activeThreadsUpdated = false;
    let newPvsApproved = 0;
    
    let foldersProcessedCount = 0;
    const foldersToProcess = ['INBOX', 'PENDING', 'OTHER', 'ARCHIVED'];
    
    const foundGroups = [];
    let skippedPrivateCount = 0;
    const allFetchedThreads = [];
    
    let inboxError = null;
    let pendingError = null;
    let otherError = null;
    let archivedError = null;

    function saveProcessedGroups() {
      try {
        fs.writeFileSync(processedGroupsPath, JSON.stringify(Array.from(client.processedNewGroups), null, 2), 'utf8');
      } catch (err) {
        console.error('[CHECKSPAM] Failed to save processed groups:', err);
      }
    }

    function saveActiveThreads() {
      try {
        fs.writeFileSync(activeThreadsPath, JSON.stringify(Array.from(client.activeThreadIds), null, 2), 'utf8');
      } catch (err) {
        console.error('[CHECKSPAM] Failed to save active threads:', err);
      }
    }

    function processThreadList(err, list, folderName, tag) {
      if (err) {
        console.error(`[CHECKSPAM] Error fetching ${folderName} threads:`, err);
        if (tag === 'INBOX') inboxError = err;
        else if (tag === 'PENDING') pendingError = err;
        else if (tag === 'OTHER') otherError = err;
        else if (tag === 'ARCHIVED') archivedError = err;
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

          // If the group is not registered in active thread IDs, add it
          let isNewGroup = false;
          if (!client.activeThreadIds.has(id)) {
            client.activeThreadIds.add(id);
            activeThreadsUpdated = true;
            isNewGroup = true;
          }

          const isNewlyExtracted = isNewGroup || tag === 'PENDING' || tag === 'OTHER' || tag === 'ARCHIVED';

          if (isNewlyExtracted) {
            foundGroups.push({
              name,
              id,
              folder: folderName,
              memberCount
            });
          }

          // Always try sending the welcome message to attempt activation/moving from spam for pending folders
          if (tag === 'PENDING' || tag === 'OTHER') {
            const welcomeMsg = "dziekuje za dodanie na grupe, moj prefix to ! po wiecej informacji wpisz !help";
            client.api.sendMessage(welcomeMsg, id, (sendErr) => {
              if (sendErr) {
                console.error(`[CHECKSPAM] welcome error for ${id}:`, sendErr);
              }
            });

            // Automatycznie dodaj użytkownika z linkiem do konta za pomocą !add (wyłącznie po wyciągnięciu ze spamu)
            setTimeout(() => {
              console.log(`[CHECKSPAM] Auto-adding user using !add to group ${id}...`);
              client.api.sendMessage('!add https://www.facebook.com/profile.php?id=61560227271099', id);
            }, 2500);

            // Mute the thread permanently (until I turn it back on / -1)
            client.api.muteThread(id, -1, (muteErr) => {
              if (muteErr) {
                console.error(`[CHECKSPAM] mute error for pending/other ${id}:`, muteErr);
              } else {
                console.log(`[CHECKSPAM] Successfully muted group ${id} permanently (-1)`);
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
          } else if (tag === 'ARCHIVED') {
            // Unarchive the thread to move it back to Inbox
            client.api.changeArchivedStatus(id, false, (archiveErr) => {
              if (archiveErr) {
                console.error(`[CHECKSPAM] Failed to unarchive group ${id}:`, archiveErr);
              } else {
                console.log(`[CHECKSPAM] Unarchived group ${id}`);
              }
            });

            // Automatycznie dodaj użytkownika z linkiem do konta za pomocą !add (wyłącznie po wyciągnięciu z archiwum)
            setTimeout(() => {
              console.log(`[CHECKSPAM] Auto-adding user using !add to archived group ${id}...`);
              client.api.sendMessage('!add https://www.facebook.com/profile.php?id=61560227271099', id);
            }, 2500);

            // Mute the thread permanently (until I turn it back on / -1)
            client.api.muteThread(id, -1, (muteErr) => {
              if (muteErr) {
                console.error(`[CHECKSPAM] mute error for archived ${id}:`, muteErr);
              } else {
                console.log(`[CHECKSPAM] Successfully muted archived group ${id} permanently (-1)`);
              }
            });

            if (!client.processedNewGroups.has(id)) {
              client.processedNewGroups.add(id);
              newGroupsFound++;
            }
          }
        } else if (thread.threadID) {
          if (tag === 'PENDING' || tag === 'OTHER') {
            const welcomeMsg = "Cześć! Jestem botem kasynowym. Mój prefix to !. Napisz !help, aby zobaczyć listę komend.";
            client.api.sendMessage(welcomeMsg, thread.threadID, (sendErr) => {
              if (sendErr) {
                console.error(`[CHECKSPAM] welcome error for PV ${thread.threadID}:`, sendErr);
              } else {
                console.log(`[CHECKSPAM] Pomyślnie zaakceptowano PV ${thread.threadID} i wysłano wiadomość powitalną.`);
              }
            });
            newPvsApproved++;
          }
          skippedPrivateCount++;
        }
      }
    }

    // Call all folders
    foldersToProcess.forEach(tag => {
      let folderName = '';
      if (tag === 'INBOX') folderName = 'Inbox';
      else if (tag === 'PENDING') folderName = 'Spam (Pending)';
      else if (tag === 'OTHER') folderName = 'Inne (Other)';
      else if (tag === 'ARCHIVED') folderName = 'Zarchiwizowane (Archived)';

      client.api.getThreadList(100, null, [tag], (err, list) => {
        processThreadList(err, list, folderName, tag);
        foldersProcessedCount++;
        if (foldersProcessedCount === foldersToProcess.length) {
          checkFinished();
        }
      });
    });

    function checkFinished() {
      // Save raw list of all checked threads to facilitate remote troubleshooting
      try {
        const debugPath = path.join(__dirname, '../data/spamcheck_debug.json');
        fs.writeFileSync(debugPath, JSON.stringify({
          timestamp: new Date().toISOString(),
          inboxError: inboxError ? (inboxError.message || inboxError.error || JSON.stringify(inboxError)) : null,
          pendingError: pendingError ? (pendingError.message || pendingError.error || JSON.stringify(pendingError)) : null,
          otherError: otherError ? (otherError.message || otherError.error || JSON.stringify(otherError)) : null,
          archivedError: archivedError ? (archivedError.message || archivedError.error || JSON.stringify(archivedError)) : null,
          threads: allFetchedThreads
        }, null, 2), 'utf8');
        console.log('[CHECKSPAM] Saved debugging logs to', debugPath);
      } catch (err) {
        console.error('[CHECKSPAM] Failed to save debug logs:', err);
      }

      let shouldRestart = false;
      if (newGroupsFound > 0) {
        saveProcessedGroups();
        shouldRestart = true;
      }
      if (activeThreadsUpdated) {
        saveActiveThreads();
        shouldRestart = true;
      }

      let responseMsg = '';
      if (inboxError || pendingError || otherError || archivedError) {
        responseMsg += `⚠️ **Wystąpiły błędy podczas pobierania wątków:**\n`;
        if (inboxError) responseMsg += `• Inbox: \`${inboxError.message || inboxError.error || JSON.stringify(inboxError)}\`\n`;
        if (pendingError) responseMsg += `• Spam (Pending): \`${pendingError.message || pendingError.error || JSON.stringify(pendingError)}\`\n`;
        if (otherError) responseMsg += `• Inne (Other): \`${otherError.message || otherError.error || JSON.stringify(otherError)}\`\n`;
        if (archivedError) responseMsg += `• Archived: \`${archivedError.message || archivedError.error || JSON.stringify(archivedError)}\`\n`;
        responseMsg += `\n`;
      }

      if (foundGroups.length > 0 || newPvsApproved > 0) {
        let pvsText = '';
        if (newPvsApproved > 0) {
          pvsText = `\n✅ Zaakceptowano i aktywowano **${newPvsApproved}** nowych czatów prywatnych (PV/DM) z folderów Spam/Inne.`;
        }
        const listText = foundGroups.map(g => `• **${g.name}** (ID: \`${g.id}\`, Osoby: **${g.memberCount}**) w folderze *${g.folder}*`).join('\n');
        responseMsg += `✅ **Skanowanie zakończone!**\n\n` +
                       (foundGroups.length > 0 ? `Znaleziono następujące grupy:\n${listText}\n\n` : '') +
                       `*(Pominięto ${skippedPrivateCount} czatów prywatnych)*` + pvsText;
        if (shouldRestart) {
          responseMsg += `\n\n🔄 **Wykryto nowe/niezarejestrowane grupy!** Automatyczny restart bota za 4 sekundy w celu odświeżenia połączeń MQTT i aktywacji nasłuchiwania na nowych czatach (łącznie zarejestrowano na ${client.activeThreadIds.size} grupach)...`;
        }
      } else {
        responseMsg += `✅ Skanowanie zakończone. Nie znaleziono żadnych grup ani nowych PV w sprawdzanych folderach. (Pominięto ${skippedPrivateCount} czatów prywatnych)`;
        if (shouldRestart) {
          responseMsg += `\n\n🔄 Automatyczny restart bota za 4 sekundy w celu odświeżenia połączeń MQTT...`;
        }
      }

      message.reply(responseMsg);

      if (shouldRestart) {
        setTimeout(() => {
          console.log('[CHECKSPAM] Exiting for auto-restart after activating/registering groups...');
          process.exit(1);
        }, 4000);
      }
    }
  }
};
