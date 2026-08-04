const config = require('../config/config');
const { formatCurrency, addXp, ensureInventoryRecord, refreshBadges, recordGame, getRandomXp } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { saveGameSessions } = require('../utils/gameStatePersistence');
const { advanceChallenge } = require('../utils/challenges');

const DIFFICULTIES = {
  easy:     { label: 'Łatwy',    emoji: '🟢', survivalProb: 0.92, maxLanes: 24, phase1Lanes: 10, phase1Decay: 0.011, phase2Decay: 0.006 },
  medium:   { label: 'Średni',   emoji: '🟡', survivalProb: 0.84, maxLanes: 20, phase1Lanes: 10, phase1Decay: 0.01, phase2Decay: 0.005 },
  hard:     { label: 'Trudny',   emoji: '🟠', survivalProb: 0.76, maxLanes: 15, phase1Lanes: 15, phase1Decay: 0.008, phase2Decay: 0.008 },
  hardcore: { label: 'Hardcore', emoji: '🔴', survivalProb: 0.65, maxLanes: 12, phase1Lanes: 12, phase1Decay: 0.01, phase2Decay: 0.01 }
};

const DIFFICULTY_ALIASES = {
  latwy: 'easy', łatwy: 'easy', easy: 'easy',
  sredni: 'medium', średni: 'medium', medium: 'medium',
  trudny: 'hard', hard: 'hard',
  hardcore: 'hardcore', ekstremalny: 'hardcore'
};

const GAME_TIMEOUT_MS = 30 * 60 * 1000;

const MULTIPLIER_TABLES = {
  easy: [1, 1.02, 1.09, 1.16, 1.23, 1.31, 1.39, 1.48, 1.57, 1.67, 1.78, 1.89, 2.02, 2.15, 2.28, 2.43, 2.58, 2.75, 2.92, 3.11, 3.31, 3.52, 3.75, 3.99, 4.24],
  medium: [1, 1.08, 1.21, 1.36, 1.53, 1.72, 1.93, 2.16, 2.44, 2.74, 3.08, 3.46, 3.89, 4.37, 4.91, 5.52, 6.19, 6.94, 7.82, 8.77, 9.87],
  hard: [1, 1.19, 1.46, 1.81, 2.23, 2.75, 3.40, 4.20, 5.18, 6.40, 7.90, 9.74, 12.04, 14.84, 18.34, 22.65],
  hardcore: [1, 1.33, 1.73, 2.30, 3.40, 5, 8.50, 14.00, 22.00, 32.00, 45.00, 65.00, 85.00]
};

function buildMultiplierTable(k) { return MULTIPLIER_TABLES[k]; }

function getSurvivalProb(difficultyKey, lane) {
  const diff = DIFFICULTIES[difficultyKey];
  if (lane <= (diff.phase1Lanes || Infinity)) {
    const decay = diff.phase1Decay != null ? diff.phase1Decay : diff.decayPerLane;
    return Math.max(0.01, diff.survivalProb - (lane - 1) * decay);
  }
  const phase1TotalDecay = (diff.phase1Decay != null ? diff.phase1Decay : diff.decayPerLane) * (diff.phase1Lanes || 0);
  const phase2Lane = lane - (diff.phase1Lanes || 0);
  const probAfterPhase1 = diff.survivalProb - phase1TotalDecay;
  const phase2Decay = diff.phase2Decay != null ? diff.phase2Decay : diff.decayPerLane;
  return Math.max(0.01, probAfterPhase1 - phase2Lane * phase2Decay);
}

let multiplierTableCache = null;
function getMultiplierTables() {
  if (!multiplierTableCache) {
    multiplierTableCache = {};
    for (const key of Object.keys(DIFFICULTIES)) multiplierTableCache[key] = buildMultiplierTable(key);
  }
  return multiplierTableCache;
}

function formatMultiplier(mult) { return `x${mult.toFixed(2)}`; }

function renderBoard(game) {
  const diff = DIFFICULTIES[game.difficulty];
  const lanes = [];
  for (let i = 1; i <= diff.maxLanes; i++) {
    if (i < game.lane + 1) lanes.push('🟩');
    else if (i === game.lane + 1) lanes.push('🐔');
    else lanes.push('⬜');
  }
  return lanes.join('');
}

module.exports = {
  name: 'chickenroad',
  aliases: ['kurczak', 'chickenrun'],
  DIFFICULTIES,
  GAME_TIMEOUT_MS,

  async execute(client, message, args) {
    const authorId = message.author.id;
    const threadId = message.guild.id;

    if (!client.activeChickenRoadGames) client.activeChickenRoadGames = new Map();

    const existing = client.activeChickenRoadGames.get(authorId);
    if (existing && Date.now() - existing.timestamp < GAME_TIMEOUT_MS) {
      const potential = Math.floor(existing.bet * existing.multiplier);
      await message.reply(
        `⚠️ Masz już aktywną grę w Chicken Road!\n` +
        `Napisz **!dalej** żeby iść dalej, albo **!odbierz** żeby zainkasować **${formatMultiplier(existing.multiplier)}** (${formatCurrency(potential)}).`
      );
      return;
    }

    const rawDifficulty = (args[0] || '').toLowerCase();
    const difficultyKey = DIFFICULTY_ALIASES[rawDifficulty];

    if (!difficultyKey) {
      const list = Object.entries(DIFFICULTIES)
        .map(([key, d]) => `${d.emoji} **${d.label}** (\`${key}\`) — szansa na pasie: **${Math.round(d.survivalProb * 100)}%**, max pasów: **${d.maxLanes}**`)
        .join('\n');
      await message.reply(
        `🐔 **Chicken Road** — przeprowadź kurczaka przez ruchliwą drogę, im dalej tym wyższy mnożnik!\n\n` +
        `Użycie: **!chickenroad <poziom> <zaklad>**\n\n${list}\n\n` +
        `W trakcie gry: **!dalej** (kolejny pas) / **!odbierz** (wypłata).`
      );
      return;
    }

    const betArg = args[1];
    const minBet = 10000;

    if (!betArg || (betArg.toLowerCase() !== 'all' && !/^\d+$/.test(betArg))) {
      await message.reply(`❌ Podaj poprawną kwotę zakładu. Przykład: **!chickenroad ${rawDifficulty} 50000** (min: ${formatCurrency(minBet)})`);
      return;
    }

    const result = await withData(store => {
      const user = createUser(authorId, store.users);
      if (user.jailUntil && user.jailUntil > Date.now()) return { error: '❌ Jesteś w więzieniu! Nie możesz teraz grać.' };

      const bet = betArg.toLowerCase() === 'all' ? user.balance : parseInt(betArg, 10);
      if (!Number.isFinite(bet) || bet < minBet) return { error: `❌ Minimalny zakład to **${formatCurrency(minBet)}**.` };
      if (bet > user.balance) return { error: `❌ Nie masz tyle na koncie! Twój stan konta: **${formatCurrency(user.balance)}**.` };

      user.balance -= bet;
      return { bet };
    });

    if (result.error) { await message.reply(result.error); return; }

    const game = { threadId, difficulty: difficultyKey, bet: result.bet, lane: 0, multiplier: 1, timestamp: Date.now() };
    client.activeChickenRoadGames.set(authorId, game);
    saveGameSessions(client);

    const diff = DIFFICULTIES[difficultyKey];
    await message.reply(
      `🐔 **Chicken Road** — poziom: ${diff.emoji} **${diff.label}**\n` +
      `Zakład: **${formatCurrency(game.bet)}**\n\n${renderBoard(game)}\n\n` +
      `Aktualny mnożnik: **${formatMultiplier(game.multiplier)}**\n` +
      `Napisz **!dalej** żeby przejść na kolejny pas, albo **!odbierz** żeby zabrać zakład z powrotem.`
    );
  },

  async handleAction(client, message, rawAction) {
    const authorId = message.author.id;
    const threadId = message.guild.id;

    if (!client.activeChickenRoadGames) client.activeChickenRoadGames = new Map();

    const game = client.activeChickenRoadGames.get(authorId);
    if (!game || game.threadId !== threadId) return;

    const action = ['dalej', 'idz', 'przejdz', 'krok'].includes(rawAction) ? 'next'
      : (['odbierz', 'cashout', 'zbierz', 'stop'].includes(rawAction) ? 'cashout' : 'ignore');

    if (action === 'ignore') return;

    const withData = require('../utils/storage').withData;
    const createUser = require('../utils/storage').createUser;

    if (action === 'cashout') {
      const payout = Math.floor(game.bet * game.multiplier);
      client.activeChickenRoadGames.delete(authorId);
      saveGameSessions(client);

      await withData(store => {
        const user = createUser(authorId, store.users);
        const inventory = ensureInventoryRecord(store.inventory, authorId);
        user.balance += payout;
        const xpGain = getRandomXp();
        addXp(user, xpGain, inventory);
        recordGame(user, payout - game.bet, xpGain, inventory);
        refreshBadges(user, inventory);
        advanceChallenge(authorId, store, 'chickenroad_wins', 1, { won: true, difficulty: game.difficulty, betAmount: game.bet });
        advanceChallenge(authorId, store, 'chickenroad_hardcore_4', game.lane, {
          difficulty: game.difficulty,
          lanes: game.lane,
          betAmount: game.bet
        });
      });

      const profit = payout - game.bet;
      const profitText = profit >= 0 ? `zysk: **+${formatCurrency(profit)}**` : `strata: **${formatCurrency(profit)}**`;

      await message.reply(
        `💰 Odebrałeś wygraną na mnożniku **${formatMultiplier(game.multiplier)}**!\n` +
        `Wypłata: **${formatCurrency(payout)}** (${profitText})`
      );
      return;
    }

    const diff = DIFFICULTIES[game.difficulty];
    const table = getMultiplierTables()[game.difficulty];

    const survivalOverride = await getEffectiveChance(authorId, 'chickenroad_survive');
    let survivalProb = getSurvivalProb(game.difficulty, game.lane + 1);
    if (Number.isFinite(survivalOverride)) survivalProb = Math.max(0, Math.min(1, survivalOverride / 100));

    const survived = Math.random() < survivalProb;

    if (!survived) {
      client.activeChickenRoadGames.delete(authorId);
      saveGameSessions(client);

      await withData(store => {
        const user = createUser(authorId, store.users);
        const inventory = ensureInventoryRecord(store.inventory, authorId);
        const xpGain = getRandomXp();
        addXp(user, xpGain, inventory);
        recordGame(user, -game.bet, xpGain, inventory);
        refreshBadges(user, inventory);
      });

      await message.reply(
        `💥 **ROZJECHANO KURCZAKA!** Wypadek na pasie **${game.lane + 1}**!\n` +
        `Straciłeś zakład: **-${formatCurrency(game.bet)}**\n\nSpróbuj ponownie: **!chickenroad ${game.difficulty} <zaklad>**`
      );
      return;
    }

    game.lane += 1;
    game.multiplier = table[game.lane];
    game.timestamp = Date.now();

    if (game.lane >= diff.maxLanes) {
      const payout = Math.floor(game.bet * game.multiplier);
      client.activeChickenRoadGames.delete(authorId);
      saveGameSessions(client);

      await withData(store => {
        const user = createUser(authorId, store.users);
        const inventory = ensureInventoryRecord(store.inventory, authorId);
        user.balance += payout;
        const xpGain = getRandomXp();
        addXp(user, xpGain, inventory);
        recordGame(user, payout - game.bet, xpGain, inventory);
        refreshBadges(user, inventory);
        advanceChallenge(authorId, store, 'chickenroad_wins', 1, { won: true, difficulty: game.difficulty, betAmount: game.bet });
        advanceChallenge(authorId, store, 'chickenroad_hardcore_4', game.lane, {
          difficulty: game.difficulty, lanes: game.lane, betAmount: game.bet
        });
      });

      await message.reply(
        `🏁 Kurczak dotarł na drugą stronę! **KONIEC TRASY** na mnożniku **${formatMultiplier(game.multiplier)}**!\n` +
        `Wypłata: **${formatCurrency(payout)}**`
      );
      return;
    }

    const potentialPayout = Math.floor(game.bet * game.multiplier);
    await message.reply(
      `${renderBoard(game)}\n\n✅ Przeżyłeś pas **${game.lane}**! Mnożnik: **${formatMultiplier(game.multiplier)}**\n` +
      `Odbiór teraz: **${formatCurrency(potentialPayout)}**\n\nNapisz **!dalej** albo **!odbierz**.`
    );
  }
};
