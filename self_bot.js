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
  lastLotteryDraw: 0,
  lastTaxCollection: 0,
  activeThreadIds: new Set(),
  async resolveUserName(api, userId) {
    if (this.userNames.has(userId)) {
      return this.userNames.get(userId);
    }
    return new Promise((resolve) => {
      api.getUserInfo(userId, (err, ret) => {
        if (!err && ret && ret[userId]) {
          const name = ret[userId].name;
          this.userNames.set(userId, name);
          resolve(name);
        } else {
          const fallback = `Uzytkownik_${userId.slice(-6)}`;
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

  console.log('[SELF-BOT] Zalogowano pomyslnie! Rozpoczynanie nasluchiwania wiadomosci...');
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
            `Nagroda główna: **+${drawResult.totalPrize.toLocaleString()} Coins** została dodana do portfela!\n` +
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
    const delay = getMsUntilNextTaxTime();
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
            `Łączna kwota podatku: **${result.totalCollected.toLocaleString()} Coins**`;

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

  // System Szybkich Palców (reakcja) co 20-60 minut
  function startReactionTimer() {
    const minDelay = 20 * 60 * 1000;
    const maxDelay = 60 * 60 * 1000;
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

  api.setOptions({
    listenEvents: true,
    selfListen: false,
    autoMarkRead: true
  });

  api.listenMqtt(async (err, event) => {
    if (err) {
      console.error('[SELF-BOT] Blad nasluchiwania:', err);
      return;
    }

    if (event.type !== 'message' || !event.body) {
      return;
    }

    const text = event.body.trim();
    const senderId = event.senderID;
    const threadId = event.threadID;
    const messageId = event.messageID;

    client.lastThreadId = threadId;
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
          
          await withData(store => {
            const u = createUser(senderId, store.users);
            u.commandsUsed = (u.commandsUsed || 0) + 1;
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

    const { isUserBlacklisted, isGroupBlacklisted } = await withData(store => {
      if (!store.profiles.blacklist) store.profiles.blacklist = [];
      if (!store.profiles.blacklistedGroups) store.profiles.blacklistedGroups = [];
      const userBl = store.profiles.blacklist.includes(senderId) && !client.config.admins.includes(senderId);
      const groupBl = store.profiles.blacklistedGroups.includes(threadId) && !client.config.admins.includes(senderId);
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
        client.userNames.set(mid, cleanName);
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
            if (!mentionedId) return null;
            const mName = client.userNames.get(mentionedId) || (event.mentions[mentionedId] || '').replace(/^@/, '');
            return { id: mentionedId, username: mName, profile: { name: mName } };
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
      const spamState = await checkSpam(senderId);
      if (spamState.blocked) {
        await messageContext.reply({ embeds: [spamState.embed] }).catch(() => null);
        return;
      }

      const cooldownState = await checkCooldown(command.name, senderId);
      if (cooldownState.active) {
        await messageContext.reply({ embeds: [cooldownState.embed] }).catch(() => null);
        return;
      }

      console.log(`[SELF-BOT] Wykonanie komendy: ${commandName} przez ${senderId} w watku ${threadId}`);
      await withData(store => {
        const u = createUser(senderId, store.users);
        u.commandsUsed = (u.commandsUsed || 0) + 1;
        u.lastActiveThreadId = threadId;
      });
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
