const fs = require('fs');
const path = require('path');
const http = require('http');
const login = require('@dongdev/fca-unofficial');

require('dotenv').config();

const config = require('./config/config');
const { ensureDataFiles, withData, createUser } = require('./utils/storage');
const { checkCooldown, checkSpam } = require('./utils/cooldowns');
const { errorEmbed } = require('./utils/embeds');
const { renderPayloadToText } = require('./utils/messenger');
const { formatCurrency, msToReadable } = require('./utils/economy');
const { extractTikTokLink, getTikTokVideoData, downloadFile } = require('./utils/tiktok');

// Algorytm Levenshteina do wykrywania litowek
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function normalizeText(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l");
}

function findClosestCommand(name, commands) {
  let best = null, bestDist = Infinity;
  const seen = new Set();
  for (const [key, cmd] of commands.entries()) {
    if (seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    const dist = levenshtein(name, key);
    if (dist < bestDist) { bestDist = dist; best = cmd.name; }
  }
  // Sugeruj tylko jesli literowka jest mala (max 2 znaki roznic)
  return bestDist <= 2 ? best : null;
}

function checkIfRestricted(commandName, args) {
  let logicalName = commandName;
  let logicalArgs = args;

  if (['atak', 'wojna', 'haracz', 'awans'].includes(commandName)) {
    logicalName = 'gang';
    logicalArgs = [commandName === 'wojna' ? 'wojna' : commandName, ...args];
  }

  const restrictedCommands = ['daily', 'rob', 'crime', 'work', 'tip', 'marry', 'rozwod', 'duel', 'rynek'];
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

ensureDataFiles();

const client = {
  commands: new Map(),
  config: config,
  processedMessages: new Set(),
  isProcessed(id) {
    if (!id) return false;
    return this.processedMessages.has(id);
  },
  markProcessed(id) {
    if (!id) return;
    this.processedMessages.add(id);
    if (this.processedMessages.size > 1000) {
      const first = this.processedMessages.values().next().value;
      this.processedMessages.delete(first);
    }
  },
  marriageRequests: new Map(),
  userNames: new Map(),
  resolvedUserNames: new Set(),
  lastLotteryDraw: 0,
  lastTaxCollection: 0,
  activeThreadIds: new Set(),
  async resolveUserName(apiOrUserId, maybeUserId) {
    let api = null;
    let userId = null;
    if (typeof apiOrUserId === 'object' && apiOrUserId !== null) {
      api = apiOrUserId;
      userId = maybeUserId;
    } else {
      userId = apiOrUserId;
      api = this.api;
    }
    if (this.resolvedUserNames.has(userId) && this.userNames.has(userId)) {
      return this.userNames.get(userId);
    }
    return new Promise((resolve) => {
      if (!api) {
        return resolve(this.userNames.get(userId) || `Użytkownik_${userId.slice(-6)}`);
      }
      api.getUserInfo(userId, (err, ret) => {
        if (!err && ret && ret[userId]) {
          const name = ret[userId].name;
          this.userNames.set(userId, name);
          this.resolvedUserNames.add(userId);
          resolve(name);
        } else {
          const fallback = this.userNames.get(userId) || `Użytkownik_${userId.slice(-6)}`;
          resolve(fallback);
        }
      });
    });
  },
  getUser(userId) {
    return null; // brak cache — komendy obsluguja fallback do UID
  }
};

function loadCommands() {
  const folderPath = path.join(__dirname, 'commands');
  const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
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
  console.log(`[SELF-BOT] Zaimplementowano ${client.commands.size} komend.`);
}

loadCommands();

const activeThreadsPath = path.join(__dirname, 'data', 'active_threads.json');
try {
  if (fs.existsSync(activeThreadsPath)) {
    const savedThreads = JSON.parse(fs.readFileSync(activeThreadsPath, 'utf8'));
    if (Array.isArray(savedThreads)) {
      client.activeThreadIds = new Set(savedThreads);
    }
  }
} catch (err) {
  console.error('[SELF-BOT] Failed to load active threads:', err);
}

const appStatePath = path.join(__dirname, 'appstate.json');
if (!fs.existsSync(appStatePath)) {
  console.error('\n======================================================');
  console.error('BLAD: Brak pliku "appstate.json" w glownym folderze bota!');
  console.error('Aby uruchomic bota na koncie osobistym (self-bot), musisz');
  console.error('wyeksportowac ciasteczka ze swojej przegladarki (np. za pomoca');
  console.error('rozszerzenia C3C FbState lub Cookie Editor) i zapisac je');
  console.error('jako "appstate.json" w tym folderze.');
  console.error('======================================================\n');
  process.exit(1);
}

function getPolandOffsetMs(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getVal = type => Number(parts.find(p => p.type === type).value);
  
  const utcDate = Date.UTC(
    getVal('year'),
    getVal('month') - 1,
    getVal('day'),
    getVal('hour'),
    getVal('minute'),
    getVal('second')
  );
  
  return utcDate - date.getTime();
}

function getMsUntilNextTaxTime() {
  const now = new Date();
  const offset = getPolandOffsetMs(now);
  const polandTime = now.getTime() + offset;
  
  const todayMidnight = new Date(polandTime);
  todayMidnight.setUTCHours(0, 0, 0, 0);
  
  const noon = todayMidnight.getTime() + 12 * 60 * 60 * 1000;
  const midnight = todayMidnight.getTime() + 24 * 60 * 60 * 1000;
  
  let nextTaxTime;
  if (polandTime < noon) {
    nextTaxTime = noon;
  } else {
    nextTaxTime = midnight;
  }
  
  const nextTaxTimeUTC = nextTaxTime - offset;
  return Math.max(0, nextTaxTimeUTC - now.getTime());
}

function getLastTaxTime() {
  const now = new Date();
  const offset = getPolandOffsetMs(now);
  const polandTime = now.getTime() + offset;
  
  const todayMidnight = new Date(polandTime);
  todayMidnight.setUTCHours(0, 0, 0, 0);
  
  const noon = todayMidnight.getTime() + 12 * 60 * 60 * 1000;
  
  let lastTaxTime;
  if (polandTime >= noon) {
    lastTaxTime = noon;
  } else {
    lastTaxTime = todayMidnight.getTime();
  }
  
  return lastTaxTime - offset;
}

let appState;
try {
  appState = JSON.parse(fs.readFileSync(appStatePath, 'utf8'));
} catch (e) {
  console.error('BLAD: Plik "appstate.json" ma niepoprawny format JSON:', e.message);
  process.exit(1);
}

console.log('[SELF-BOT] Logowanie do Messengera za pomoca appstate.json...');

login({ appState }, (loginErr, api) => {
  if (loginErr) {
    console.error('[SELF-BOT] Logowanie nie powiodlo sie:', loginErr);
    process.exit(1);
  }

  client.api = api;

  console.log('[SELF-BOT] Zalogowano pomyslnie! Rozpoczynanie nasluchiwania wiadomosci...');
  
  // Wrap api.sendMessage to add typing indicator and 1s delay
  const originalSendMessage = api.sendMessage;
  api.sendMessage = function(message, threadID, callback, messageID) {
    if (!threadID) {
      return originalSendMessage.call(api, message, threadID, callback, messageID);
    }
    let stopTyping = null;
    try {
      stopTyping = api.sendTypingIndicator(threadID, () => {});
    } catch (err) {
      console.error('[SELF-BOT] Blad typing indicatora:', err);
    }
    setTimeout(() => {
      if (typeof stopTyping === 'function') {
        try {
          stopTyping();
        } catch (_) {}
      }
      originalSendMessage.call(api, message, threadID, callback, messageID);
    }, 1000);
  };

  client.api = api;
  client.lastLotteryDraw = Date.now();

  // Funkcja do uruchamiania losowania loterii
  function startLotteryTimer() {
    setTimeout(async () => {
      if (!client.api || !client.lastThreadId) {
        startLotteryTimer(); // Spróbuj ponownie jeśli api nie jest gotowe
        return;
      }

      try {
        const drawResult = await withData(store => {
          const ticketPool = [];
          let totalTickets = 0;

          for (const [userId, inv] of Object.entries(store.inventory || {})) {
            const ticketCount = inv.ticket || 0;
            if (ticketCount > 0) {
              totalTickets += ticketCount;
              for (let i = 0; i < ticketCount; i++) {
                ticketPool.push(userId);
              }
            }
          }

          if (ticketPool.length === 0) {
            return null;
          }

          const winnerId = ticketPool[Math.floor(Math.random() * ticketPool.length)];
          const totalPrize = totalTickets * 50000;

          const winnerUser = createUser(winnerId, store.users);
          winnerUser.balance = (winnerUser.balance || 0) + totalPrize;

          for (const inv of Object.values(store.inventory || {})) {
            if (inv.ticket) {
              inv.ticket = 0;
            }
          }

          return {
            winnerId,
            totalTickets,
            totalPrize
          };
        });

        if (drawResult) {
          client.lastLotteryDraw = Date.now();
          const winnerName = await client.resolveUserName(client.api, drawResult.winnerId);
          const announceMsg = 
            `🎟️ **LOSOWANIE LOTERII**\n` +
            `Łączna liczba biletów w grze: **${drawResult.totalTickets}**\n` +
            `Wygrywa: **${winnerName}**! 🎉\n` +
            `Nagroda główna: **+${drawResult.totalPrize.toLocaleString()} viccoinów** została dodana do portfela!\n` +
            `Wszystkie bilety zostały zresetowane. Kup nowe w sklepie za pomocą \`!sklep 4\`.`;

          const targets = Array.from(client.activeThreadIds);
          if (targets.length > 0) {
            for (const tId of targets) {
              client.api.sendMessage(announceMsg, tId);
            }
          } else if (client.lastThreadId) {
            client.api.sendMessage(announceMsg, client.lastThreadId);
          }
        }
      } catch (err) {
        console.error('[LOTTERY] Blad podczas losowania loterii:', err);
      }

      // Rekurencyjnie uruchamiaj timer od nowa (zawsze licząc od ostatniego losowania)
      startLotteryTimer();
    }, 10 * 60 * 1000); // 10 minut
  }

  // Uruchom timer loterii
  startLotteryTimer();

  // System podatków co 12 godzin (zawsze o północy i w południe)
  function startTaxCollection() {
    const delay = getMsUntilNextTaxTime() + 2000;
    setTimeout(async () => {
      try {
        const result = await withData(store => {
          let totalCollected = 0;
          const taxedUsers = [];

          for (const [userId, user] of Object.entries(store.users || {})) {
            if (user.balance > 0) {
              const tax = Math.floor(user.balance * 0.02);
              user.balance -= tax;
              totalCollected += tax;
              taxedUsers.push({
                userId,
                tax,
                newBalance: user.balance
              });
            }
          }

          return { totalCollected, taxedUsers: taxedUsers.length };
        });

        // Ustaw czas ostatniego poboru na zaokrąglony czas poboru (dokładnie 00:00 lub 12:00)
        client.lastTaxCollection = getLastTaxTime();

        if (result.totalCollected > 0) {
          const announceMsg = 
            `📊 **POBÓR PODATKÓW**\n` +
            `Pobrano podatek w wysokości: **2% salda**\n` +
            `Liczba opodatkowanych graczy: **${result.taxedUsers}**\n` +
            `Łączna kwota podatku: **${result.totalCollected.toLocaleString()} viccoinów**`;

          const targets = Array.from(client.activeThreadIds);
          if (targets.length > 0) {
            for (const tId of targets) {
              client.api.sendMessage(announceMsg, tId);
            }
          } else if (client.lastThreadId) {
            client.api.sendMessage(announceMsg, client.lastThreadId);
          }
        }
      } catch (err) {
        console.error('[TAX] Błąd podczas poboru podatków:', err);
      }

      // Rekurencyjnie uruchamiaj timer od nowa
      startTaxCollection();
    }, delay);
  }

  // Inicjalizuj ostatni pobór podatków i uruchom timer
  client.lastTaxCollection = getLastTaxTime();
  client.getMsUntilNextTaxTime = getMsUntilNextTaxTime;
  startTaxCollection();

  // System przypomnień o pożyczkach co 12 godzin (zawsze o północy i w południe)
  function startLoanReminder() {
    const delay = getMsUntilNextTaxTime() + 2000;
    setTimeout(async () => {
      try {
        if (client.api) {
          const targets = Array.from(client.activeThreadIds);
          for (const threadId of targets) {
            client.api.getThreadInfo(threadId, async (err, info) => {
              if (err || !info || !info.participantIDs || info.participantIDs.length === 0) return;
              
              const participants = info.participantIDs;
              const matchingUsers = [];
              
              await withData(store => {
                for (const pid of participants) {
                  const user = store.users[pid];
                  if (user && user.activeLoan) {
                    matchingUsers.push({
                      pid,
                      amount: user.activeLoan.amount,
                      takenAt: user.activeLoan.takenAt
                    });
                  }
                }
              });
              
              if (matchingUsers.length > 0) {
                const reminders = [];
                for (const mu of matchingUsers) {
                  const name = await client.resolveUserName(client.api, mu.pid);
                  const elapsed = Date.now() - mu.takenAt;
                  const remainingRepayMs = Math.max(0, 48 * 60 * 60 * 1000 - elapsed);
                  reminders.push({
                    pid: mu.pid,
                    name,
                    amount: mu.amount,
                    timeLeftStr: msToReadable(remainingRepayMs)
                  });
                }
                
                const lines = reminders.map(r => `👤 @${r.name} — Pozostało do spłaty: **${formatCurrency(r.amount)}** (Auto-spłata za: **${r.timeLeftStr}**)`).join('\n');
                const tagMentions = reminders.map(r => ({
                  tag: `@${r.name}`,
                  id: r.pid
                }));
                
                const remindMsg = {
                  body: `⚠️ **PRZYPOMNIENIE O POŻYCZCE** ⚠️\nNastępujące osoby mają aktywną pożyczkę do spłaty:\n\n${lines}\n\n👉 Spłać komendą: \`!pozyczka splac <kwota|all>\``,
                  mentions: tagMentions
                };
                
                client.api.sendMessage(remindMsg, threadId);
              }
            });
          }
        }
      } catch (err) {
        console.error('[LOAN-REMINDER] Błąd podczas wysyłania przypomnienia:', err);
      }
      
      startLoanReminder();
    }, delay);
  }
  
  startLoanReminder();

  // System Szybkich Palców (reakcja) co 9-24 godzin
  function startReactionTimer() {
    const minDelay = 9 * 60 * 60 * 1000;
    const maxDelay = 24 * 60 * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    setTimeout(async () => {
      try {
        if (client.api && client.activeThreadIds.size > 0) {
          const targets = Array.from(client.activeThreadIds);
          
          if (!client.activeReactions) {
            client.activeReactions = new Map();
          }

          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

          for (const threadId of targets) {
            let code = '';
            for (let i = 0; i < 6; i++) {
              code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const prize = Math.floor(Math.random() * (200000 - 20000 + 1)) + 20000;

            client.activeReactions.set(threadId, {
              code,
              prize,
              active: true,
              timestamp: Date.now()
            });

            const announceMsg = `⚡ **SZYBKIE PALCE** ⚡\nKto pierwszy przepisze poniższy kod, wygrywa **💰 ${prize.toLocaleString()}**!\n\n👉 **\`${code}\`**`;
            
            client.api.sendMessage(announceMsg, threadId);

            // Auto-cleanup po 2 minutach
            setTimeout(() => {
              const game = client.activeReactions.get(threadId);
              if (game && game.code === code && game.active) {
                client.activeReactions.delete(threadId);
                client.api.sendMessage(`⌛ **SZYBKIE PALCE** ⌛\nCzas minął! Nikt nie przepisał kodu **\`${code}\`** na czas.`, threadId);
              }
            }, 2 * 60 * 1000).unref();
          }
        }
      } catch (err) {
        console.error('[REACTION] Błąd podczas uruchamiania reakcji:', err);
      }

      startReactionTimer();
    }, delay);
  }

  // Uruchom timer reakcji
  startReactionTimer();

  // System Zgadnij Kraj (flagi) co 10-24 godzin
  function startFlagTimer() {
    const minDelay = 10 * 60 * 60 * 1000;
    const maxDelay = 24 * 60 * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    setTimeout(async () => {
      try {
        if (client.api && client.activeThreadIds.size > 0) {
          const targets = Array.from(client.activeThreadIds);

          if (!client.activeFlags) {
            client.activeFlags = new Map();
          }

          const flagaCmd = require('./commands/flaga');
          const flagsList = flagaCmd.flagsList;

          for (const threadId of targets) {
            const randomFlag = flagsList[Math.floor(Math.random() * flagsList.length)];
            const { time, prize } = flagaCmd.getGameSettings(randomFlag.region);

            client.activeFlags.set(threadId, {
              emoji: randomFlag.emoji,
              answers: randomFlag.answers,
              countryName: randomFlag.name,
              prize,
              active: true,
              timestamp: Date.now()
            });

            const announceMsg = `🏳️ **ZGADNIJ KRAJ** 🏳️\nJaki kraj reprezentuje ta flaga?\n\n👉 **${randomFlag.emoji}**\n\n💰 Nagroda: **💰 ${prize.toLocaleString()}**!\n⏱️ Masz ${time} sekund na odpowiedź.`;
            client.api.sendMessage(announceMsg, threadId);

            // Auto-cleanup po określonym czasie
            setTimeout(() => {
              const game = client.activeFlags.get(threadId);
              if (game && game.emoji === randomFlag.emoji && game.active) {
                client.activeFlags.delete(threadId);
                client.api.sendMessage(`⌛ **ZGADNIJ KRAJ** ⌛\nCzas minął! Nikt nie zgadł flagi **${randomFlag.emoji}** (${randomFlag.name}) na czas.`, threadId);
              }
            }, time * 1000).unref();
          }
        }
      } catch (err) {
        console.error('[FLAGS] Błąd podczas uruchamiania zgadywanki flag:', err);
      }

      startFlagTimer();
    }, delay);
  }

  // Uruchom timer flag
  startFlagTimer();

  api.setOptions({
    listenEvents: true,
    selfListen: false,
    autoMarkRead: false
  });

  api.listenMqtt(async (err, event) => {
    if (err) {
      console.error('[SELF-BOT] Blad nasluchiwania:', err);
      return;
    }

    // Interceptor dla zmiany pseudonimu (log:thread-nickname lub log:user-nickname)
    const isNicknameEvent = (event.type === 'event' && (event.logMessageType === 'log:thread-nickname' || event.logMessageType === 'log:user-nickname')) 
                         || (event.type === 'log:thread-nickname' || event.type === 'log:user-nickname');
    if (isNicknameEvent) {
      const threadId = event.threadID;
      const targetId = event.logMessageData?.participant_id 
                    || event.logMessageData?.participantId 
                    || event.logMessageData?.target_id 
                    || event.logMessageData?.targetId
                    || event.participantID
                    || event.targetID;
      
      const newNickname = event.logMessageData?.nickname 
                       || event.logMessageData?.newNickname
                       || event.logMessageData?.value
                       || event.nickname;

      if (threadId && targetId) {
        let guard = null;
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].nicknameGuard) {
            guard = store.profiles.threadSettings[threadId].nicknameGuard;
          }
        });

        // Ignoruj zmiany wykonane przez samego bota tylko wtedy, gdy przywrócił poprawny zablokowany nick (zapobiega pętlom)
        const botId = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : '';
        if (guard && botId && event.author && String(event.author) === String(botId) && newNickname === guard.nickname) {
          return;
        }

        if (guard && String(guard.userId) === String(targetId) && newNickname !== guard.nickname) {
          console.log(`[GUARDNICK] Wykryto zmianę pseudonimu użytkownika ${targetId} na "${newNickname || '<brak>'}" w wątku ${threadId}. Przywracanie do "${guard.nickname}"...`);
          api.changeNickname(guard.nickname, threadId, targetId, (err) => {
            if (err) {
              console.error('[SELF-BOT GUARDNICK ERROR]', err);
            } else {
              console.log(`[GUARDNICK] Pomyślnie przywrócono pseudonim "${guard.nickname}" dla ${targetId}.`);
            }
          });
        }
      }
      return;
    }

    // Interceptor dla wyjścia z grupy (log:unsubscribe) - loop
    const isUnsubscribeEvent = (event.type === 'event' && event.logMessageType === 'log:unsubscribe') || (event.type === 'log:unsubscribe');
    if (isUnsubscribeEvent) {
      const threadId = event.threadID;
      
      // Wyciągamy ID usuniętych/wychodzących użytkowników
      const removedUsers = [];
      
      // Jeśli użytkownik wyszedł dobrowolnie (leftParticipantFbId)
      if (event.logMessageData?.leftParticipantFbId) {
        removedUsers.push(String(event.logMessageData.leftParticipantFbId));
      }
      
      // Jeśli użytkownik został usunięty/wyrzucony (removedParticipants)
      const dataParticipants = event.logMessageData?.removedParticipants;
      if (Array.isArray(dataParticipants)) {
        for (const p of dataParticipants) {
          if (p && typeof p === 'object') {
            const uid = p.userFbId || p.userID || p.id;
            if (uid) removedUsers.push(String(uid));
          } else if (p) {
            removedUsers.push(String(p));
          }
        }
      }
      
      // Fallbacki dla innych wersji FCA/Messenger
      if (event.participantID) {
        removedUsers.push(String(event.participantID));
      }
      if (event.targetID) {
        removedUsers.push(String(event.targetID));
      }

      const uniqueRemoved = [...new Set(removedUsers)];

      if (threadId && uniqueRemoved.length > 0) {
        let loopUsers = [];
        await withData(store => {
          if (store.profiles.threadSettings && store.profiles.threadSettings[threadId] && store.profiles.threadSettings[threadId].loopUsers) {
            loopUsers = [...store.profiles.threadSettings[threadId].loopUsers];
          }
        });

        if (loopUsers.length > 0) {
          for (const userId of uniqueRemoved) {
            if (loopUsers.includes(userId)) {
              console.log(`[LOOP] Wykryto wyjście/wyrzucenie zapętlonego użytkownika ${userId} z wątku ${threadId}. Dodawanie z powrotem...`);
              api.addUserToGroup(userId, threadId, (err) => {
                if (err) {
                  console.error(`[LOOP ERROR] Nie udało się dodać użytkownika ${userId} z powrotem:`, err);
                } else {
                  console.log(`[LOOP] Pomyślnie dodano użytkownika ${userId} z powrotem do grupy ${threadId}.`);
                  api.sendMessage(`🔁 **Zapętlony użytkownik został dodany z powrotem do grupy.**`, threadId);
                }
              });
            }
          }
        }
      }
      return;
    }

    // Interceptor dla usunięcia wiadomości (message_unsend)
    if (event.type === 'message_unsend') {
      client.messageCache = client.messageCache || new Map();
      const cached = client.messageCache.get(event.messageID);
      if (cached) {
        // Nie wysyłaj powiadomienia, jeśli autorem usuniętej wiadomości jest twórca (100060812419294)
        if (cached.senderID === '100060812419294') {
          return;
        }

        // Sprawdź, czy nadawca jest podadminem bota
        const isSubAdmin = config.admins.includes(cached.senderID);

        // Sprawdź ustawienia grupy w bazie danych
        const isLoggingEnabled = await withData(store => {
          const settings = store.profiles.threadSettings && store.profiles.threadSettings[event.threadID];
          return settings ? settings.unsendLoggingEnabled !== false : true; // domyślnie włączone
        });

        // Logujemy jeśli włączone lub jeśli nadawca jest podadminem (zawsze)
        if (isLoggingEnabled || isSubAdmin) {
          try {
            const senderName = await client.resolveUserName(api, cached.senderID);
            const announceMsg = `🗑️ **Użytkownik ${senderName} usunął wiadomość:**\n"${cached.body}"`;
            api.sendMessage(announceMsg, event.threadID);
          } catch (e) {
            console.error('[SELF-BOT] Blad podczas obslugi message_unsend:', e);
          }
        }
      }
      return;
    }

    // Zapisz wiadomość w pamięci podręcznej przed filtracją body (do obsługi usuwania)
    if (['message', 'message_reply'].includes(event.type)) {
      client.messageCache = client.messageCache || new Map();
      let cacheBody = event.body || '';
      if (!cacheBody && event.attachments && event.attachments.length > 0) {
        cacheBody = `[Załącznik: ${event.attachments.map(a => a.type || 'plik').join(', ')}]`;
      }
      if (cacheBody) {
        client.messageCache.set(event.messageID, {
          body: cacheBody,
          senderID: event.senderID,
          timestamp: Date.now()
        });
        // Ogranicz rozmiar pamięci podręcznej do 2000 wpisów
        if (client.messageCache.size > 2000) {
          const firstKey = client.messageCache.keys().next().value;
          client.messageCache.delete(firstKey);
        }
      }
    }

    if (!['message', 'message_reply'].includes(event.type) || !event.body) {
      return;
    }

    const text = event.body.trim();
    const senderId = event.senderID;
    const threadId = event.threadID;
    const messageId = event.messageID;

    // Automatyczny pobieracz wideo z TikToka
    const tiktokLink = extractTikTokLink(text);
    if (tiktokLink && !text.startsWith(client.config.prefix)) {
      console.log(`[TIKTOK] Wykryto link do TikToka od ${senderId} w wątku ${threadId}: ${tiktokLink}`);
      api.setMessageReaction('⏳', messageId, () => {});

      (async () => {
        const tempFile = path.join(__dirname, 'data', `tiktok_${messageId}.mp4`);
        try {
          const data = await getTikTokVideoData(tiktokLink);
          const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

          if (data.size > MAX_SIZE) {
            console.log(`[TIKTOK] Film jest zbyt duży (${(data.size / 1024 / 1024).toFixed(2)} MB). Wysyłam link bezpośredni.`);
            api.sendMessage(
              `⚠️ **Wideo jest zbyt duże (${(data.size / 1024 / 1024).toFixed(2)} MB), aby wysłać je bezpośrednio.**\n\n` +
              `👤 Autor: @${data.author}\n` +
              `📝 Tytuł: ${data.title}\n\n` +
              `👀 ${data.views.toLocaleString()} | ❤️ ${data.likes.toLocaleString()} | 💬 ${data.comments.toLocaleString()} | 🔁 ${data.shares.toLocaleString()}\n\n` +
              `🔗 Link bez znaku wodnego:\n${data.playUrl}`,
              threadId,
              (err) => {
                if (err) console.error('[TIKTOK SEND MSG ERROR]', err);
                api.setMessageReaction('❌', messageId, () => {});
              },
              messageId
            );
            return;
          }

          console.log(`[TIKTOK] Pobieranie wideo (${(data.size / 1024 / 1024).toFixed(2)} MB) do: ${tempFile}`);
          await downloadFile(data.playUrl, tempFile);

          console.log(`[TIKTOK] Wysyłanie wideo do wątku ${threadId}...`);
          api.sendMessage({
            body: `🎥 **TikTok od @${data.author}**\n` +
                  `${data.title}\n\n` +
                  `👀 ${data.views.toLocaleString()} | ❤️ ${data.likes.toLocaleString()} | 💬 ${data.comments.toLocaleString()} | 🔁 ${data.shares.toLocaleString()}`,
            attachment: fs.createReadStream(tempFile)
          }, threadId, (err) => {
            if (err) {
              console.error('[TIKTOK SEND VIDEO ERROR]', err);
              api.setMessageReaction('❌', messageId, () => {});
              api.sendMessage(`❌ Nie udało się wysłać pobranego wideo.`, threadId, () => {}, messageId);
            } else {
              api.setMessageReaction('✅', messageId, () => {});
            }
          }, messageId);

        } catch (err) {
          console.error('[TIKTOK ERROR]', err.message);
          api.setMessageReaction('❌', messageId, () => {});
          api.sendMessage(`❌ Nie udało się pobrać wideo z TikToka.`, threadId, () => {}, messageId);
        } finally {
          // Czyszczenie pliku tymczasowego (poczekaj 5s, by upewnić się, że strumień FB został zamknięty)
          setTimeout(() => {
            if (fs.existsSync(tempFile)) {
              try {
                fs.unlinkSync(tempFile);
                console.log(`[TIKTOK] Wyczyszczono plik tymczasowy: ${tempFile}`);
              } catch (e) {
                console.error('[TIKTOK CLEANUP ERROR]', e.message);
              }
            }
          }, 5000).unref();
        }
      })();
    }

    // Odczytaj wiadomosc po losowym czasie (500ms - 1200ms)
    if (threadId) {
      setTimeout(() => {
        try {
          api.markAsRead(threadId, (err) => {
            if (err) console.error('[SELF-BOT] Blad podczas oznaczania jako przeczytane:', err);
          });
        } catch (e) {
          console.error('[SELF-BOT] Blad api.markAsRead:', e);
        }
      }, 500 + Math.random() * 700);
    }

    client.lastThreadId = threadId;

    // Interceptor dla potwierdzeń (np. !afkdel ok/stop)
    if (client.pendingConfirmations) {
      const pendingKey = `${threadId}-${senderId}`;
      const pending = client.pendingConfirmations.get(pendingKey);
      if (pending) {
        const cleanText = text.toLowerCase().trim();
        if (cleanText === 'ok' || cleanText === 'stop') {
          clearTimeout(pending.timeout);
          client.pendingConfirmations.delete(pendingKey);

          if (cleanText === 'ok') {
            if (typeof pending.callback === 'function') {
              pending.callback().catch(err => {
                console.error('[CONFIRMATION CALLBACK ERROR]:', err);
              });
            }
          } else {
            api.sendMessage('✅ Pomyślnie przerwano.', threadId, () => {}, messageId);
          }
          return; // Zakończ przetwarzanie, nie traktuj jako komendy
        }
      }
    }

    const isGroup = threadId && threadId !== senderId;
    const isCommand = text.startsWith(client.config.prefix);
    if (!isCommand) {
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
          u.lastActiveTime = Date.now(); // Zapisz czas ostatniej aktywności
          if (isGroup) {
            u.groupMessages = u.groupMessages || {};
            u.groupMessages[threadId] = (u.groupMessages[threadId] || 0) + 1;
          }
        });
      }
    }

    if (threadId) {
      if (!client.activeThreadIds.has(threadId)) {
        client.activeThreadIds.add(threadId);
        try {
          fs.writeFileSync(activeThreadsPath, JSON.stringify(Array.from(client.activeThreadIds), null, 2), 'utf8');
        } catch (e) {
          console.error('[SELF-BOT] Failed to save active threads:', e);
        }
      }
    }

    if (client.isProcessed(messageId)) {
      return;
    }
    client.markProcessed(messageId);

    // Interceptor dla Szybkich Palców (reakcja)
    if (client.activeReactions) {
      const reaction = client.activeReactions.get(threadId);
      if (reaction && reaction.active && text === reaction.code) {
        reaction.active = false;
        client.activeReactions.delete(threadId);

        const prize = reaction.prize;
        const winnerId = senderId;
        const winnerName = await client.resolveUserName(api, winnerId);

        await withData(store => {
          const u = createUser(winnerId, store.users);
          u.balance = (u.balance || 0) + prize;
        });

        const replyMsg = `🎉 **SZYBKIE PALCE** 🎉\nGratulacje **${winnerName}**! Jako pierwszy przepisałeś kod i wygrywasz **+💰 ${prize.toLocaleString()}**!`;
        api.sendMessage(replyMsg, threadId, () => {}, messageId);
        return; // Nie przetwarzaj dalej jako komendy
      }
    }

    // Interceptor dla Zgadnij Kraj (flagi)
    if (client.activeFlags) {
      const flagGame = client.activeFlags.get(threadId);
      if (flagGame && flagGame.active) {
        const normalizedInput = normalizeText(text);
        const isCorrect = flagGame.answers.some(ans => normalizeText(ans) === normalizedInput);

        if (isCorrect) {
          flagGame.active = false;
          client.activeFlags.delete(threadId);

          const prize = flagGame.prize;
          const winnerId = senderId;
          const winnerName = await client.resolveUserName(api, winnerId);

          await withData(store => {
            const u = createUser(winnerId, store.users);
            u.balance = (u.balance || 0) + prize;
          });

          const replyMsg = `🎉 **ZGADNIJ KRAJ** 🎉\nGratulacje **${winnerName}**! Poprawna odpowiedź to **${flagGame.countryName}**! Wygrywasz **+💰 ${prize.toLocaleString()}**!`;
          api.sendMessage(replyMsg, threadId, () => {}, messageId);
          return; // Nie przetwarzaj dalej jako komendy
        }
      }
    }

    // Interceptor dla aktywnej gry w blackjacka
    if (!client.activeBlackjackGames) {
      client.activeBlackjackGames = new Map();
    }
    const activeGame = client.activeBlackjackGames.get(senderId);
    if (activeGame && activeGame.threadId === threadId) {
      const cleanText = text.trim().toLowerCase().replace(/^!/, '');
      if (['hit', 'stand', 'double', 'dobierz', 'stop', 'podwoj'].includes(cleanText)) {
        const bjCommand = client.commands.get('blackjack');
        if (bjCommand && typeof bjCommand.handleAction === 'function') {
          console.log(`[SELF-BOT] Wykonanie ruchu w blackjacku: ${cleanText} przez ${senderId}`);
          
          let isBlocked = false;
          await withData(store => {
            const u = createUser(senderId, store.users);
            u.commandCounts = u.commandCounts || {};
            
            const bypassIds = [
              '100060812419294',
              '100014929176652',
              '61562475523609',
              '615792123922351',
              '100093902840911',
              '100046279354282',
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
            u.lastActiveThreadId = threadId;
          });

          const senderName = await client.resolveUserName(api, senderId);
          const senderUser = {
            id: senderId,
            username: senderName,
            profile: { name: senderName }
          };

          const messageContext = {
            client,
            author: senderUser,
            content: text,
            guild: { id: threadId },
            rawEvent: event,
            reply: async (payload) => {
              return new Promise((resolve, reject) => {
                const replyText = renderPayloadToText(payload);
                if (!replyText) return resolve(null);
                api.sendMessage(replyText, threadId, (sendErr, msgInfo) => {
                  if (sendErr) return reject(sendErr);
                  resolve(msgInfo);
                }, messageId);
              });
            }
          };

          if (isBlocked) {
            const replyText = '❌ System bezpieczeństwa wykrył, że to konto zachowuje się jak multikonto (brak normalnej aktywności, używanie wyłącznie komend zarobkowych). Interakcja z botem została zablokowana.';
            api.sendMessage(replyText, threadId, () => {}, messageId);
            return;
          }

          try {
            await bjCommand.handleAction(client, messageContext, cleanText);
          } catch (actionErr) {
            console.error('[SELF-BOT] Blad ruchu w blackjacku:', actionErr);
          }
          return;
        }
      }
    }

    if (!text.startsWith(client.config.prefix)) {
      return;
    }

    const args = text.slice(client.config.prefix.length).trim().split(/\s+/).filter(Boolean);
    const commandName = (args.shift() || '').toLowerCase();

    if (!commandName) {
      return;
    }

    const creatorId = '100060812419294';
    const { isUserBlacklisted, isGroupBlacklisted } = await withData(store => {
      if (!store.profiles.blacklist) store.profiles.blacklist = [];
      if (!store.profiles.trueBlacklist) store.profiles.trueBlacklist = [];
      if (!store.profiles.blacklistedGroups) store.profiles.blacklistedGroups = [];
      const userBl = (store.profiles.blacklist.includes(senderId) || store.profiles.trueBlacklist.includes(senderId)) && senderId !== creatorId;
      const groupBl = store.profiles.blacklistedGroups.includes(threadId) && senderId !== creatorId;
      return { isUserBlacklisted: userBl, isGroupBlacklisted: groupBl };
    });

    if (isUserBlacklisted || isGroupBlacklisted) {
      return;
    }

    const command = client.commands.get(commandName);
    if (!command) {
      const suggestion = findClosestCommand(commandName, client.commands);
      const msg = suggestion
        ? `Nie znaleziono komendy "!${commandName}". Czy chodzilo Ci o !${suggestion}?`
        : `Nie znaleziono komendy "!${commandName}". Wpisz !help, aby zobaczyc liste komend.`;
      api.sendMessage(msg, threadId, () => {}, messageId);
      return;
    }

    // Zapisz imiona z wzmianek do cache'a
    if (event.mentions) {
      for (const [mid, mName] of Object.entries(event.mentions)) {
        const cleanName = mName.replace(/^@/, '');
        if (!client.resolvedUserNames.has(mid)) {
          client.userNames.set(mid, cleanName);
        }
      }
    }

    const senderName = await client.resolveUserName(api, senderId);
    const senderUser = {
      id: senderId,
      username: senderName,
      profile: {
        name: senderName,
        firstName: senderName.split(' ')[0] || 'Uzytkownik',
        lastName: senderName.split(' ').slice(1).join(' ') || senderId.slice(-6),
        avatarUrl: ''
      }
    };

    const messageContext = {
      client,
      author: senderUser,
      content: text,
      guild: {
        id: threadId
      },
      rawEvent: event,
      mentionedIds: Object.keys(event.mentions || {}),
      mentions: {
        users: {
          first: () => {
            const mentionedId = Object.keys(event.mentions || {})[0];
            if (mentionedId) {
              const mName = client.userNames.get(mentionedId) || (event.mentions[mentionedId] || '').replace(/^@/, '');
              return { id: mentionedId, username: mName, profile: { name: mName } };
            }
            return null;
          }
        }
      },
      reply: async (payload) => {
        return new Promise((resolve, reject) => {
          const replyText = renderPayloadToText(payload);
          if (!replyText) {
            return resolve(null);
          }
          api.sendMessage(replyText, threadId, (sendErr, msgInfo) => {
            if (sendErr) {
              console.error(`[SELF-BOT] Blad wysylania odpowiedzi do watku ${threadId}:`, sendErr);
              return reject(sendErr);
            }
            resolve(msgInfo);
          }, messageId);
        });
      }
    };

    try {
      const restrictedAdmins = ['100089655356822', '61554894353095', '100053875564339'];
      const restrictedAdminCmds = ['admadd', 'admgiv', 'admgivglobal', 'reset', 'del'];

      if (restrictedAdmins.includes(senderId) && restrictedAdminCmds.includes(command.name)) {
        await withData(store => {
          if (!store.profiles.blacklist) store.profiles.blacklist = [];
          for (const id of restrictedAdmins) {
            if (!store.profiles.blacklist.includes(id)) {
              store.profiles.blacklist.push(id);
            }
          }
        });
        await messageContext.reply('❌ Nie masz uprawnień do użycia tej komendy administratora. Ty oraz pozostali zaufani administratorzy zostaliście dodani do czarnej listy!');
        return;
      }

      console.log(`[SELF-BOT] Wykonanie komendy: ${commandName} przez ${senderId} w watku ${threadId}`);
      let isBlocked = false;
      let multiAccountInfo = null;
      await withData(store => {
        const u = createUser(senderId, store.users);
        u.lastActiveThreadId = threadId;
        u.commandCounts = u.commandCounts || {};

        // Sprawdź czy to multikonto (wykluczając twórcę, administratorów i GOAT)
        const bypassIds = [
          '100060812419294',
          '100014929176652',
          '61562475523609',
          '615792123922351',
          '100093902840911',
          '100046279354282',
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
          } else {
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
              u.lastActiveTime = Date.now(); // Zapisz czas ostatniej aktywności
            }
          }
        } else {
          u.isMultiAccount = false;
          u.commandsUsed = (u.commandsUsed || 0) + 1;
          u.commandCounts[command.name] = (u.commandCounts[command.name] || 0) + 1;
          u.lastActiveTime = Date.now(); // Zapisz czas ostatniej aktywności
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
              messageContext.reply(lvlMsg).catch(() => null);
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
        await messageContext.reply('❌ System bezpieczeństwa wykrył, że to konto zachowuje się jak multikonto (brak normalnej aktywności, używanie wyłącznie komend zarobkowych). Interakcja z botem została zablokowana.');
        return;
      }

      const isBribe = command.name === 'crime' && args[0] && ['lapowka', 'łapówka', 'przekup'].includes(args[0].toLowerCase().trim());
      let cooldownState = { active: false };
      if (!isBribe) {
        cooldownState = await checkCooldown(command.name, senderId);
      }
      if (cooldownState.active) {
        await messageContext.reply({ embeds: [cooldownState.embed] }).catch(() => null);
        return;
      }

      const spamState = await checkSpam(senderId);
      if (spamState.blocked) {
        await messageContext.reply({ embeds: [spamState.embed] }).catch(() => null);
        return;
      }

      await command.execute(client, messageContext, args);
    } catch (cmdErr) {
      console.error(`[SELF-BOT] Blad komendy: ${commandName}`, cmdErr);
      await messageContext.reply({
        embeds: [errorEmbed('Blad komendy', 'Wystapil problem podczas wykonywania komendy.')]
      }).catch(() => null);
    }
  });
});

// Serwer HTTP dla sprawdzenia poprawnosci działania (Railway Health Check)
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Messenger casino self-bot is running.');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`[SELF-BOT] Dummy health check server listening on port ${PORT}`);
});
