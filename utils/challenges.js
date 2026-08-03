const { withData, createUser, ensureInventoryRecord } = require('./storage');
const { formatCurrency } = require('./economy');

const CHALLENGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const CHALLENGES = [
  { id: 'work_35', type: 'work_count', label: 'Pracownik miesiaca', description: 'Uzyj !work 35 razy', target: 35, reward: 130000 },
  { id: 'work_21', type: 'work_count', label: 'Pracownik tygodnia', description: 'Uzyj !work 21 razy', target: 21, reward: 75000 },
  { id: 'rob_4', type: 'rob_count', label: 'Zlodziej', description: 'Okradnij kogos 4 razy (!rob)', target: 4, reward: 80000 },
  { id: 'cf_streak_4', type: 'coinflip_streak', label: 'Farciarz', description: 'Wygrywaj !coinflip 4 razy pod rzad (min. 10k stawka)', target: 4, minBet: 10000, reward: 150000 },
  { id: 'crime_10', type: 'crime_count', label: 'Przestepca', description: 'Uzyj !crime 10 razy', target: 10, reward: 250000 },
  { id: 'pkn_streak_3', type: 'pkn_streak', label: 'Manipulant', description: 'Wygrywaj !pkn 3 razy pod rzad (min. 20k stawka)', target: 3, minBet: 20000, reward: 220000 },
  { id: 'slots_streak_5', type: 'slots_streak', label: 'Dzordzo 5', description: 'Wygrywaj !slots 5 razy pod rzad (min. 10k stawka)', target: 5, minBet: 10000, reward: 110000 },
  { id: 'ruletka_streak_5', type: 'ruletka_streak', label: 'Urodzony hazardzista', description: 'Wygrywaj !ruletka 5 razy pod rzad (min. 10k stawka)', target: 5, minBet: 10000, reward: 100000 },
  { id: 'bet_streak_6', type: 'bet_streak_under74', label: 'Szczesciarz', description: 'Wygrywaj !bet 6 razy pod rzad (min. 25k, tylko liczby 1-73)', target: 6, minBet: 25000, maxNumber: 73, reward: 320000 },
  { id: 'mecz_streak_3', type: 'mecz_streak', label: 'Bookmacher', description: 'Postaw 3 skuteczne kupony !mecz pod rzad (min. 20k kazdy)', target: 3, minBet: 20000, reward: 100000 },
  { id: 'cr_hardcore_4', type: 'chickenroad_hardcore_4', label: 'Wilson lo siento', description: 'Dojdz do 4. pasa i wyplac w !chickenroad Hardcore (min. 30k stawka)', target: 4, minBet: 30000, difficulty: 'hardcore', reward: 350000 },
  { id: 'wojna_streak_3', type: 'wojna_streak', label: 'Wojenny weteran', description: 'Wygraj w !wojna 3 razy pod rzad (min. 30k stawka)', target: 3, minBet: 30000, reward: 100000 },
  { id: 'bj_3', type: 'blackjack_wins', label: 'Mistrz Blackjacka', description: 'Wygrywaj w !blackjack 3 razy (kazda wygrana reka liczy sie)', target: 3, reward: 120000 },
  { id: 'cr_3', type: 'chickenroad_wins', label: 'Kurczak na trasie', description: 'Ukończ 3 gry w !chickenroad (wyplac lub dojdz do konca)', target: 3, reward: 425000 }
];

function pickChallenge(userId, store) {
  const existing = store.profiles.dailyChallenges && store.profiles.dailyChallenges[userId];

  if (existing && existing.expiresAt > Date.now() && !existing.completed) {
    return existing;
  }

  if (existing && existing.completed && !existing.claimed) {
    return existing;
  }

  const user = createUser(userId, store.users);
  const available = CHALLENGES;
  const used = (store.profiles.dailyChallengeHistory && store.profiles.dailyChallengeHistory[userId]) || [];
  const unused = available.filter(c => !used.includes(c.id));
  const pool = unused.length > 0 ? unused : available;
  const challenge = pool[Math.floor(Math.random() * pool.length)];

  store.profiles.dailyChallenges = store.profiles.dailyChallenges || {};
  store.profiles.dailyChallenges[userId] = {
    taskId: challenge.id,
    type: challenge.type,
    label: challenge.label,
    description: challenge.description,
    target: challenge.target,
    progress: 0,
    completed: false,
    claimed: false,
    pickedAt: Date.now(),
    expiresAt: Date.now() + CHALLENGE_COOLDOWN_MS,
    nextAvailableAt: Date.now() + CHALLENGE_COOLDOWN_MS,
    minBet: challenge.minBet || 0,
    maxNumber: challenge.maxNumber || null,
    difficulty: challenge.difficulty || null,
    reward: challenge.reward,
    streak: 0
  };

  store.profiles.dailyChallengeHistory = store.profiles.dailyChallengeHistory || {};
  store.profiles.dailyChallengeHistory[userId] = used.slice(-10).concat(challenge.id);

  return store.profiles.dailyChallenges[userId];
}

function getActiveChallenge(userId, store) {
  const challenge = store.profiles.dailyChallenges && store.profiles.dailyChallenges[userId];
  if (!challenge) return null;
  if (challenge.completed && !challenge.claimed) return challenge;
  if (challenge.expiresAt <= Date.now()) {
    delete store.profiles.dailyChallenges[userId];
    return null;
  }
  if (challenge.completed && challenge.claimed) return null;
  return challenge;
}

function advanceChallenge(userId, store, type, amount = 1, meta = {}) {
  const challenge = getActiveChallenge(userId, store);
  if (!challenge || challenge.completed || challenge.type !== type) return null;

  const remaining = challenge.target - challenge.progress;
  if (remaining <= 0) return challenge;

  if (type === 'bet_streak_under74' || type === 'coinflip_streak' || type === 'slots_streak' || type === 'ruletka_streak' || type === 'mecz_streak' || type === 'pkn_streak' || type === 'wojna_streak' || type === 'blackjack_wins') {
    const minBet = challenge.minBet || 0;
    const maxNumber = challenge.maxNumber || null;
    const betAmount = meta.betAmount || 0;
    const chosenNumber = meta.chosenNumber || null;

    if (betAmount < minBet) {
      challenge.streak = 0;
      challenge.progress = 0;
      return challenge;
    }
    if (maxNumber && chosenNumber && chosenNumber > maxNumber) {
      challenge.streak = 0;
      challenge.progress = 0;
      return challenge;
    }

    if (meta.won) {
      challenge.streak = (challenge.streak || 0) + 1;
      challenge.progress = Math.min(challenge.streak, challenge.target);
    } else {
      challenge.streak = 0;
      challenge.progress = 0;
      return challenge;
    }
  } else if (type === 'chickenroad_hardcore_4') {
    const difficulty = meta.difficulty || '';
    const lanes = meta.lanes || 0;
    const betAmount = meta.betAmount || 0;
    const minBet = challenge.minBet || 0;

    if (difficulty !== (challenge.difficulty || 'hardcore')) return challenge;
    if (betAmount < minBet) return challenge;
    challenge.progress = Math.max(challenge.progress, Math.min(lanes, challenge.target));
  } else {
    challenge.progress += Math.min(amount, remaining);
  }

  if (challenge.progress >= challenge.target) {
    challenge.completed = true;
  }

  return challenge;
}

function claimChallengeReward(userId, store) {
  const challenge = store.profiles.dailyChallenges && store.profiles.dailyChallenges[userId];
  if (!challenge || !challenge.completed || challenge.claimed) return null;

  const user = createUser(userId, store.users);
  const inventory = ensureInventoryRecord(store.inventory, userId);
  const reward = challenge.reward || 0;

  user.balance = (user.balance || 0) + reward;
  challenge.claimed = true;

  return { reward, challenge };
}

function resetExpiredChallenges(store) {
  if (!store.profiles.dailyChallenges) return;
  const now = Date.now();
  for (const [userId, challenge] of Object.entries(store.profiles.dailyChallenges)) {
    if (challenge.expiresAt && challenge.expiresAt <= now) {
      delete store.profiles.dailyChallenges[userId];
    }
  }
}

module.exports = {
  CHALLENGE_COOLDOWN_MS,
  CHALLENGES,
  pickChallenge,
  getActiveChallenge,
  advanceChallenge,
  claimChallengeReward,
  resetExpiredChallenges
};
