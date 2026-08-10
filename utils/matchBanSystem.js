const { getPolishMidnight, msToReadable } = require('./economy');
const { withData, createUser } = require('./storage');

const DAILY_MATCH_LIMIT = 10;

const LIMIT_ERROR_MESSAGE = limited => `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
  `🚫 **LIMIT KUPONÓW PRZEKROCZONY** 🚫\n` +
  `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
  `Zagrałeś już dzisiaj maksymalną liczbę **10 kuponów** na mecze i multimecze.\n\n` +
  `⏳ Nowy limit otrzymasz za: **${msToReadable(limited)}** (o północy).\n` +
  `━━━━━━━━━━━━━━━━━━━━━━━━`;

function getTodayMidnight() {
  return getPolishMidnight(new Date());
}

function getTomorrowMidnight() {
  const today = getTodayMidnight();
  return today + 24 * 60 * 60 * 1000;
}

function ensureDailyReset(user) {
  const now = Date.now();
  const todayMidnight = getTodayMidnight();
  if (!user.lastMatchPlayMidnight || user.lastMatchPlayMidnight < todayMidnight) {
    user.lastMatchPlayMidnight = todayMidnight;
    user.matchCountToday = 0;
  }
}

async function isMatchBanned(userId) {
  return withData(store => {
    const user = createUser(userId, store.users);
    ensureDailyReset(user);

    if (user.matchCountToday >= DAILY_MATCH_LIMIT) {
      const timeRemaining = getTomorrowMidnight() - Date.now();
      return {
        banned: true,
        error: LIMIT_ERROR_MESSAGE(timeRemaining)
      };
    }

    return { banned: false };
  });
}

async function consumeMatchSlot(userId) {
  return withData(store => {
    const user = createUser(userId, store.users);
    ensureDailyReset(user);

    if (user.matchCountToday >= DAILY_MATCH_LIMIT) {
      const timeRemaining = getTomorrowMidnight() - Date.now();
      return {
        success: false,
        error: LIMIT_ERROR_MESSAGE(timeRemaining)
      };
    }

    user.matchCountToday = (user.matchCountToday || 0) + 1;
    user.lastMatchPlayMidnight = getTodayMidnight();

    return { success: true, remaining: DAILY_MATCH_LIMIT - user.matchCountToday };
  });
}

module.exports = {
  DAILY_MATCH_LIMIT,
  isMatchBanned,
  consumeMatchSlot,
  getTodayMidnight,
  getTomorrowMidnight
};
