const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

require('dotenv').config();

const config = require('./config/config');
const { ensureDataFiles, withData, createUser } = require('./utils/storage');
const { checkCooldown, checkSpam, checkAdminDailyLimit } = require('./utils/cooldowns');
const { errorEmbed } = require('./utils/embeds');
const { createMessageContext, createMessengerClient } = require('./utils/messenger');
const { checkAndResetBalance, checkPendingBalanceBlock } = require('./utils/balanceMonitor');
const { resolveArtefaktyCategory, resolveGangArtefaktyCategory, buildArtefaktyCategoryList, buildGangArtefaktyCategoryList } = require('./utils/artefactHelpSystem');

const client = createMessengerClient(config);
client.config = config;

function checkIfRestricted(commandName, args) {
  let logicalName = commandName;
  let logicalArgs = args;

  if (['atak', 'wojna', 'haracz', 'awans'].includes(commandName)) {
    logicalName = 'gang';
    logicalArgs = [commandName === 'wojna' ? 'wojna' : commandName, ...args];
  }

  const restrictedCommands = ['daily', 'rob', 'crime', 'work', 'tip', 'marry', 'rozwod', 'duel', 'rynek', 'firma'];
  if (restrictedCommands.includes(logicalName)) {
    return true;
  }
  if (logicalName === 'gang') {
    const sub = String(logicalArgs[0] || '').toLowerCase();
    const restrictedGangSubs = ['skok', 'dolacz', 'zapros', 'atak', 'wojna'];
    if (restrictedGangSubs.includes(sub)) {
      return true;
    }
  }
  return false;
}

function loadCommands() {
  const folderPath = path.join(__dirname, 'commands');
  const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);

    if (!command.name || typeof command.execute !== 'function') {
      console.warn(`[WARN] Invalid command file: ${file}`);
      continue;
    }

    client.commands.set(command.name, command);

    for (const alias of command.aliases || []) {
      client.commands.set(alias, command);
    }
  }
}

async function executeCommand(event, pageId) {
  if (event.message?.is_echo) {
    return;
  }

  const senderId = event.sender?.id;
  const threadId = event.threadID || pageId;
  const isGroup = threadId !== senderId;
  const text = String(event.message?.text || '').trim();

  if (!senderId || !text) {
    return;
  }

  if (!client.pendingBails) client.pendingBails = new Map();
  const pendingBail = client.pendingBails.get(senderId);
  if (pendingBail) {
    const cleanText = text.trim().toLowerCase().replace(/^!/, '').split(/\s+/)[0];
    if (cleanText === 'wykup' || cleanText === 'stop') {
      const senderUser = await client.cacheUser(senderId);
      const message = createMessageContext(client, senderUser, text, [], event, pageId);
      await handleBailResponse(client, message, pendingBail, cleanText);
      return;
    }
  }

  if (!client.pendingArtefakty) client.pendingArtefakty = new Map();
  const pendingArtefakty = client.pendingArtefakty.get(senderId);
  if (pendingArtefakty && pendingArtefakty.threadId === (event.threadID || pageId)) {
    const categoryKey = resolveArtefaktyCategory(text.trim());
    if (categoryKey) {
      clearTimeout(pendingArtefakty.timeout);
      client.pendingArtefakty.delete(senderId);

      const { getNonEventItems, getEventItems } = require('./commands/artefakty');
      const standardItems = getNonEventItems();
      const eventItemsList = getEventItems();

      const embed = categoryKey === 'standardowe'
        ? buildArtefaktyCategoryList('standardowe', standardItems)
        : buildArtefaktyCategoryList('eventowe', eventItemsList);

      const replyText = require('./utils/messenger').renderPayloadToText({ embeds: [embed] });
      if (replyText) {
        client.sendText(senderId, replyText, 'RESPONSE');
      }
      return;
    }
  }

  if (!client.pendingGangArtefakty) client.pendingGangArtefakty = new Map();
  const pendingGangArtefakty = client.pendingGangArtefakty.get(senderId);
  if (pendingGangArtefakty && pendingGangArtefakty.threadId === (event.threadID || pageId)) {
    const categoryKey = resolveGangArtefaktyCategory(text.trim());
    if (categoryKey) {
      clearTimeout(pendingGangArtefakty.timeout);
      client.pendingGangArtefakty.delete(senderId);

      const { getAllCrateDefinitions, getCrateOrder } = require('./utils/gangBossShop');
      const config = require('./config/config');
      const crates = getAllCrateDefinitions();
      const regularItems = [];
      let regularNum = 0;
      for (const crateId of getCrateOrder()) {
        const crate = crates[crateId];
        for (const [itemId, def] of Object.entries(crate.items || {})) {
          regularNum++;
          regularItems.push({
            num: regularNum,
            id: itemId,
            name: def.name,
            emoji: def.emoji,
            description: def.description
          });
        }
      }

      const seasonRewards = [];
      const rewardIds = ['korona_hegemonii', 'lepsze_ufortyfikowanie', 'kodeks_honoru'];
      for (let i = 0; i < rewardIds.length; i++) {
        const rewardId = rewardIds[i];
        const def = config.gangSeasonRewards && config.gangSeasonRewards[rewardId];
        if (!def) continue;
        seasonRewards.push({
          num: i + 1,
          id: rewardId,
          name: def.name,
          emoji: def.emoji,
          description: def.description
        });
      }

      const items = categoryKey === 'standardowe' ? regularItems : seasonRewards;
      const embed = buildGangArtefaktyCategoryList(categoryKey, items);

      const replyText = require('./utils/messenger').renderPayloadToText({ embeds: [embed] });
      if (replyText) {
        client.sendText(senderId, replyText, 'RESPONSE');
      }
      return;
    }
  }

  const senderUser = await client.cacheUser(senderId);
  const msgForBalanceReset = createMessageContext(client, senderUser, text, [], event, pageId);

  let blockedByBalanceReset = false;
  try {
    blockedByBalanceReset = await checkAndResetBalance(
      payload => msgForBalanceReset.reply(payload).catch(() => null),
      senderId
    );
  } catch (err) {
    console.error('[BALANCE-CHECK] Nieoczekiwany błąd podczas sprawdzania salda:', err);
  }

  if (blockedByBalanceReset) {
    return;
  }

  // Interceptor dla aktywnej gry w blackjacka
  if (!client.activeBlackjackGames) {
    client.activeBlackjackGames = new Map();
  }
  const activeGame = client.activeBlackjackGames.get(senderId);
  if (activeGame) {
    if (Date.now() - (activeGame.timestamp || 0) > 300000) {
      client.activeBlackjackGames.delete(senderId);
    } else if (activeGame.threadId === threadId) {
      const cleanText = text.trim().toLowerCase().replace(/^!/, '');
      if (['hit', 'stand', 'double', 'dobierz', 'stop', 'podwoj'].includes(cleanText)) {
        const bjCommand = client.commands.get('blackjack');
        if (bjCommand && typeof bjCommand.handleAction === 'function') {
          const message = createMessageContext(client, senderUser, text, [cleanText], event, pageId);
          
          let isBlocked = false;
          await withData(store => {
            const u = createUser(senderId, store.users);
            u.commandCounts = u.commandCounts || {};
            
            const bypassIds = [
              '100060812419294',
              '100014929176652',
              '61562475523609',
              '61579212392235',
              '615792123922351',
              '100093902840911',
              '100046279354282',
              '61577775725598',
              ...config.admins
            ];

            if (!bypassIds.includes(senderId) && u.isMultiAccount) {
              let canUnblock = false;
              if (u.unblockMessageTarget !== undefined && u.unblockMessageTarget !== null) {
                if ((u.messageCount || 0) >= u.unblockMessageTarget) {
                  canUnblock = true;
                }
              } else {
                if ((u.messageCount || 0) >= (u.commandsUsed || 0)) {
                  canUnblock = true;
                }
              }

              if (canUnblock) {
                u.isMultiAccount = false;
                delete u.unblockMessageTarget;
                u.commandsUsed = (u.commandsUsed || 0) + 1;
                u.commandCounts['blackjack'] = (u.commandCounts['blackjack'] || 0) + 1;
              } else {
                // blackjack is not restricted
              }
            } else {
              if (bypassIds.includes(senderId)) {
                u.isMultiAccount = false;
              }
              u.commandsUsed = (u.commandsUsed || 0) + 1;
              u.commandCounts['blackjack'] = (u.commandCounts['blackjack'] || 0) + 1;
            }
          });

          if (isBlocked) {
            await message.reply('❌ System bezpieczeństwa wykrył, że to konto zachowuje się jak multikonto (brak normalnej aktywności, używanie wyłącznie komend zarobkowych). Interakcja z botem została zablokowana.');
            return;
          }

          try {
            await bjCommand.handleAction(client, message, cleanText);
          } catch (err) {
            console.error('[WEBHOOK] Blad ruchu w blackjacku:', err);
          }
          return;
        }
      }
    }
  }

  if (!text.startsWith(client.config.prefix)) {
    if (!client.lastNormalMessageTime) {
      client.lastNormalMessageTime = new Map();
    }
    const lastTime = client.lastNormalMessageTime.get(senderId) || 0;
    const now = Date.now();
    if (now - lastTime >= 2000) {
      client.lastNormalMessageTime.set(senderId, now);
      await withData(store => {
        const u = createUser(senderId, store.users);
        u.messageCount = (u.messageCount || 0) + 1;
      });
    }
    return;
  }

  const args = text.slice(client.config.prefix.length).trim().split(/\s+/).filter(Boolean);
  const commandName = (args.shift() || '').toLowerCase();

  if (!commandName) {
    return;
  }

  const creatorId = '100060812419294';
  const isUserBlacklisted = await withData(store => {
    if (!store.profiles.blacklist) store.profiles.blacklist = [];
    if (!store.profiles.trueBlacklist) store.profiles.trueBlacklist = [];

    return senderId !== creatorId
      && (store.profiles.blacklist.includes(senderId) || store.profiles.trueBlacklist.includes(senderId));
  });

  if (isUserBlacklisted) {
    return;
  }

  if (isGroup) {
    const isGroupBlacklisted = await withData(store => {
      store.profiles = store.profiles || {};
      store.profiles.blacklistedGroups = store.profiles.blacklistedGroups || [];
      return store.profiles.blacklistedGroups.includes(threadId);
    });
    if (isGroupBlacklisted) {
      return;
    }
  }

  const command = client.commands.get(commandName);
  const message = createMessageContext(client, senderUser, text, args, event, pageId);

  if (!command) {
    await message.reply({
      embeds: [errorEmbed('Nieznana komenda', `Komenda \`${commandName}\` nie istnieje.`)]
    }).catch(() => null);
    return;
  }

  if (senderId !== creatorId) {
    const isDisabled = await withData(store => {
      store.profiles = store.profiles || {};
      const disabled = new Set(store.profiles.disabledCommands || []);
      const mainName = command.name;
      return disabled.has(commandName) || disabled.has(mainName) || (command.aliases || []).some(a => disabled.has(a));
    });
    if (isDisabled) {
      await message.reply('🔧 Bot jest aktualnie w trakcie prac konserwacyjnych nad tą komendą. Spróbuj ponownie później.').catch(() => null);
      return;
    }
  }

  try {
    let isBlocked = false;
    let multiAccountInfo = null;
    await withData(store => {
      const u = createUser(senderId, store.users);
      u.commandCounts = u.commandCounts || {};

      // Sprawdź czy to multikonto (wykluczając twórcę, administratorów i GOAT)
      const bypassIds = [
        '100060812419294',
        '100014929176652',
        '61562475523609',
        '61579212392235',
        '615792123922351',
        '100093902840911',
        '100046279354282',
        '61577775725598',
        ...config.admins
      ];
      if (!bypassIds.includes(senderId)) {
        if (u.isMultiAccount) {
          let canUnblock = false;
          if (u.unblockMessageTarget !== undefined && u.unblockMessageTarget !== null) {
            if ((u.messageCount || 0) >= u.unblockMessageTarget) {
              canUnblock = true;
            }
          } else {
            if ((u.messageCount || 0) >= (u.commandsUsed || 0)) {
              canUnblock = true;
            }
          }

          if (canUnblock) {
            u.isMultiAccount = false;
            delete u.unblockMessageTarget;
            u.multiAccountWarnings = 0;
            u.commandsUsed = (u.commandsUsed || 0) + 1;
            u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
          } else {
            const isRestricted = checkIfRestricted(command.name, args);
            if (isRestricted) {
              isBlocked = true;
            }
          }
          // Jeśli nie jest zablokowany, sprawdzamy warunki blokady
          const totalCommands = (u.commandsUsed || 0) + 1;
          const trackedCommandsCount = Object.values(u.commandCounts || {}).reduce((a, b) => a + b, 0) + 1;
          const normalMessages = u.messageCount || 0;
          const logicalCommandName = ['gang', 'atak', 'wojna', 'haracz', 'awans'].includes(command.name) ? 'gang' : command.name;
          const workCount = (u.commandCounts['work'] || 0) + (logicalCommandName === 'work' ? 1 : 0);
          const crimeCount = (u.commandCounts['crime'] || 0) + (logicalCommandName === 'crime' ? 1 : 0);
          const dailyCount = (u.commandCounts['daily'] || 0) + (logicalCommandName === 'daily' ? 1 : 0);
          const tipCount = (u.commandCounts['tip'] || 0) + (logicalCommandName === 'tip' ? 1 : 0);
          const robCount = (u.commandCounts['rob'] || 0) + (logicalCommandName === 'rob' ? 1 : 0);
          const gangCount = (u.commandCounts['gang'] || 0) + (logicalCommandName === 'gang' ? 1 : 0)
            + (u.commandCounts['atak'] || 0) + (u.commandCounts['haracz'] || 0) + (u.commandCounts['awans'] || 0);
          const balCount = (u.commandCounts['bal'] || 0) + (logicalCommandName === 'bal' ? 1 : 0);
          const earningsCount = workCount + crimeCount + dailyCount + tipCount + robCount + gangCount + balCount;

          if (normalMessages < trackedCommandsCount) {
            if (trackedCommandsCount >= 10) {
              const isMostlyEarnings = (earningsCount / trackedCommandsCount) >= 0.80;
              if (isMostlyEarnings) {
                u.multiAccountWarnings = (u.multiAccountWarnings || 0) + 1;
                if (u.multiAccountWarnings >= 4 || trackedCommandsCount >= 13) {
                  if (!u.isMultiAccount) {
                    u.isMultiAccount = true;
                    
                    let mostTippedId = null;
                    let maxCount = 0;
                    if (u.tipsSent) {
                      for (const [rcvId, count] of Object.entries(u.tipsSent)) {
                        if (count > maxCount) {
                          maxCount = count;
                          mostTippedId = rcvId;
                        }
                      }
                    }
                    multiAccountInfo = {
                      blockedId: senderId,
                      mostTippedId,
                      tipsCount: maxCount
                    };
                  }
                  u.unblockMessageTarget = (u.messageCount || 0) + 100;
                  const isRestricted = checkIfRestricted(command.name, args);
                  if (isRestricted) {
                    isBlocked = true;
                  }
                }
              } else {
                u.multiAccountWarnings = 0;
              }
            } else {
              u.multiAccountWarnings = 0;
            }
          } else {
            u.multiAccountWarnings = 0;
          }

          if (!isBlocked) {
            u.commandsUsed = totalCommands;
            u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
          }
        }
      } else {
        u.isMultiAccount = false;
        u.commandsUsed = (u.commandsUsed || 0) + 1;
        u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
      }

      if (!isBlocked) {
        const { addXp, ensureInventoryRecord, getMilestoneRewardDescription } = require('./utils/economy');
        const inv = ensureInventoryRecord(store.inventory, senderId);
        const xpResult = addXp(u, 15, inv);
        if (xpResult.leveledUp) {
          let lvlMsg = `🎉 **AWANS!** Awansowałeś na **poziom ${xpResult.newLevel}** za użycie komendy!`;
          if (xpResult.milestonesGained && xpResult.milestonesGained.length > 0) {
            for (const lvl of xpResult.milestonesGained) {
              lvlMsg += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
            }
          }
          setTimeout(() => {
            message.reply(lvlMsg).catch(() => null);
          }, 500);
        }
      }
    });

    if (multiAccountInfo) {
      (async () => {
        try {
          const blockedName = client.userNames.get(multiAccountInfo.blockedId) || `Użytkownik_${multiAccountInfo.blockedId.slice(-6)}`;
          let tippedText = 'Brak przelewów';
          if (multiAccountInfo.mostTippedId) {
            const tippedName = client.userNames.get(multiAccountInfo.mostTippedId) || `Użytkownik_${multiAccountInfo.mostTippedId.slice(-6)}`;
            tippedText = `${tippedName} (ID: ${multiAccountInfo.mostTippedId}) [ilość przelewów: ${multiAccountInfo.tipsCount}]`;
          }
          
          const adminGroupId = config.adminGroupId || '5277347745703557';
          const notificationMsg = 
            `🚨 **WYKRYTO MULTIKONTO / BLOKADA** 🚨\n\n` +
            `👤 Zablokowane konto: **${blockedName}**\n` +
            `🆔 ID: **${multiAccountInfo.blockedId}**\n` +
            `💸 Najczęstsze przelewy (!tip): **${tippedText}**`;

          if (client.api && typeof client.api.sendMessage === 'function') {
            client.api.sendMessage(notificationMsg, adminGroupId);
          }
        } catch (err) {
          console.error('[MULTIACCOUNT NOTIFICATION] Failed to notify admin group:', err);
        }
      })();
    }

    if (isBlocked) {
      await message.reply('❌ System bezpieczeństwa wykrył, że to konto zachowuje się jak multikonto (brak normalnej aktywności, używanie wyłącznie komend zarobkowych). Interakcja z botem została zablokowana.');
      return;
    }

    const isBribe = command.name === 'crime' && args[0] && ['lapowka', 'łapówka', 'przekup'].includes(args[0].toLowerCase().trim());
    let cooldownState = { active: false };
    if (!isBribe) {
      cooldownState = await checkCooldown(command.name, senderId);
    }
    if (cooldownState.active) {
      await message.reply({ embeds: [cooldownState.embed] }).catch(() => null);
      return;
    }

    const adminDailyLimitState = await checkAdminDailyLimit(command.name, senderId);
    if (!adminDailyLimitState.allowed) {
      await message.reply({ embeds: [adminDailyLimitState.embed] }).catch(() => null);
      return;
    }

    const spamState = await checkSpam(senderId);
    if (spamState.blocked) {
      await message.reply({ embeds: [spamState.embed] }).catch(() => null);
      return;
    }

    const blockedByPendingReport = await checkPendingBalanceBlock(
      payload => message.reply(payload).catch(() => null),
      senderId,
      command.name
    );
    if (blockedByPendingReport) {
      return;
    }

    // Pobranie i wyczyszczenie powiadomień o degradacji domu
    let houseNotificationMsg = '';
    await withData(store => {
      const u = store.users[senderId];
      if (u && u.houseNotifications && u.houseNotifications.length > 0) {
        for (const n of u.houseNotifications) {
          if (n.type === 'lost') {
            houseNotificationMsg += `\n🏚️ **Utrata Domu:** Twój dom (Rudera) został zabrany z powodu braku środków na czynsz!`;
          } else {
            houseNotificationMsg += `\n🏚️ **Degradacja Domu:** Twój dom został zdegradowany z **${n.oldTierName}** do **${n.newTierName}** z powodu braku środków na czynsz! Wszystkie ulepszenia zostały zresetowane.`;
          }
        }
        u.houseNotifications = [];
      }
    });

    if (houseNotificationMsg) {
      await message.reply(houseNotificationMsg.trim()).catch(() => null);
    }

    await command.execute(client, message, args);
  } catch (error) {
    console.error(`[COMMAND] ${commandName} failed:`, error);
    await message.reply({
      embeds: [errorEmbed('Blad komendy', 'Wystapil nieoczekiwany problem podczas wykonywania komendy.')]
    }).catch(() => null);
  }
}

async function handleWebhookPayload(payload) {
  if (!payload || payload.object !== 'page') {
    return;
  }

  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      const messageId = event.message?.mid;

      if (client.isProcessed(messageId)) {
        continue;
      }

      client.markProcessed(messageId);
      await executeCommand(event, event.recipient?.id || entry.id);
    }
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}

function createServer() {
  const port = Number(process.env.PORT || config.messenger.port || 3000);
  const webhookPath = config.messenger.webhookPath || '/webhook';
  const verifyToken = process.env.MESSENGER_VERIFY_TOKEN?.trim() || '';

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === webhookPath) {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === verifyToken) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(challenge || '');
        return;
      }

      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid verify token.');
      return;
    }

    if (req.method === 'POST' && url.pathname === webhookPath) {
      try {
        const rawBody = await readRawBody(req);

        if (!client.verifySignature(req.headers['x-hub-signature-256'], rawBody)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid signature.');
          return;
        }

        const payload = JSON.parse(rawBody.toString('utf8'));
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('EVENT_RECEIVED');

        handleWebhookPayload(payload).catch(error => {
          console.error('[WEBHOOK] Processing failed:', error);
        });
      } catch (error) {
        console.error('[WEBHOOK] Invalid request:', error);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request.');
      }

      return;
    }

    if (req.method === 'GET' && url.pathname === '/privacy') {
      const filePath = path.join(__dirname, 'privacy.html');
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Privacy policy not found.');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/terms') {
      const filePath = path.join(__dirname, 'terms.html');
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Terms of service not found.');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/deletion') {
      const filePath = path.join(__dirname, 'deletion.html');
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Data deletion page not found.');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Messenger casino bot is running.');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found.');
  }).listen(port, '0.0.0.0', () => {
    console.log(`[BOT] Messenger webhook listening on http://0.0.0.0:${port}${webhookPath}`);
  });
}

async function handleBailResponse(client, message, pendingBail, action) {
  const authorId = message.author.id;
  client.pendingBails.delete(authorId);
  clearTimeout(pendingBail.timeout);

  if (action === 'stop') {
    await message.reply('❌ Wykup został anulowany.');
    return;
  }

  if (action === 'wykup') {
    const mentioned = message.mentions && message.mentions.users && message.mentions.users.first();
    const mentionedId = mentioned ? String(mentioned.id) : null;
    if (mentionedId && mentionedId !== String(pendingBail.targetId)) {
      await message.reply('❌ Oznaczyłeś złego gracza.');
      return;
    }

    const bailResult = await withData(store => {
      const target = store.users[pendingBail.targetId];
      if (!target || !target.jailUntil || target.jailUntil <= Date.now()) {
        return { error: '❌ Ten gracz już nie jest w więzieniu.' };
      }
      const user = store.users[authorId];
      if (!user || user.balance < pendingBail.cost) {
        return { error: '❌ Nie posiadasz wystarczającej ilości VicCoinów.' };
      }
      user.balance -= pendingBail.cost;
      target.jailUntil = 0;
      return { ok: true, cost: pendingBail.cost, targetName: target.name || pendingBail.targetName };
    });

    if (bailResult.error) {
      await message.reply(bailResult.error);
      return;
    }

    await message.reply(
      `🎉 Udało się wykupić @${bailResult.targetName} z więzienia!\n\n` +
      `💸 Zapłacono: **${bailResult.cost.toLocaleString()} VicCoinów**.`
    );
  }
}

async function start() {
  ensureDataFiles();
  loadCommands();

  if (!process.env.MESSENGER_VERIFY_TOKEN?.trim()) {
    throw new Error('Missing MESSENGER_VERIFY_TOKEN in environment variables.');
  }

  if (!process.env.MESSENGER_PAGE_ACCESS_TOKEN?.trim()) {
    throw new Error('Missing MESSENGER_PAGE_ACCESS_TOKEN in environment variables.');
  }

  createServer();
}

start().catch(error => {
  console.error('[FATAL] Failed to start Messenger bot:', error);
  process.exit(1);
});
