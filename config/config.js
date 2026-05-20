module.exports = {
  prefix: '!',
  admins: ['100060812419294'],
  logRecipientId: '',
  casinoName: 'Bot',
  currencyEmoji: '💰',
  messenger: {
    port: 3000,
    webhookPath: '/webhook',
    graphVersion: 'v24.0',
    pageId: '',
    botAvatarUrl: ''
  },
  embed: {
    primary: 0xD4AF37
  },
  antiSpam: {
    maxCommands: 6,
    perSeconds: 10,
    muteSeconds: 15
  },
  cooldowns: {
    default: 3,
    help: 3,
    bal: 2,
    daily: 5,
    work: 600,
    crime: 900,
    rob: 20,
    slots: 4,
    blackjack: 10,
    coinflip: 4,
    ruletka: 5,
    bet: 3,
    duel: 3,
    leaderboard: 8,
    wplac: 3,
    wyplac: 3,
    sklep: 3,
    eq: 3,
    marry: 12,
    pfp: 4,
    admadd: 2,
    del: 2,
    weather: 5,
    wiki: 5,
    dictionary: 5,
    news: 8,
    joke: 3,
    fact: 3,
    quote: 3,
    xkcd: 5,
    movie: 6,
    currency: 5,
    hello: 2,
    bye: 2,
    thanks: 2,
    loteria: 3,
    loteriastart: 2,
    podatki: 3
  },
  economy: {
    defaultUser: {
      balance: 5000,
      bank: 10000,
      level: 5,
      xp: 240,
      totalWon: 12000,
      totalLost: 8000,
      gamesPlayed: 53,
      prestige: 1,
      bio: '',
      badges: [],
      marriedTo: null,
      dailyCooldown: 0
    },
    maxBet: 100000,
    dailyMin: 900,
    dailyMax: 2200,
    dailyVipBonus: 1.25,
    workMin: 5000,
    workMax: 25000,
    workVipBonus: 1.1,
    crimeSuccessChance: 0.52,
    crimeWinMin: 400,
    crimeWinMax: 2400,
    crimeLoseMin: 200,
    crimeLoseMax: 1100,
    robSuccessChance: 0.38,
    robMinTarget: 2500,
    robMinPercent: 0.1,
    robMaxPercent: 0.3,
    bankBaseCapacity: 100000,
    bankVipBonus: 25000,
    bankPrestigeBonus: 25000,
    goldenCardBonus: 50000,
    xpPerLevelBase: 180,
    xpPerLevelGrowth: 55
  },
  shopItems: {
    vip: {
      name: 'VIP Pass',
      emoji: '👑',
      price: 100000,
      description: 'Daje bonus do !daily i !work oraz zwieksza pojemnosc banku.',
      type: 'permanent'
    },

    klodka: {
      name: 'Klodka',
      emoji: '🔒',
      price: 35000,
      description: 'Chroni przed kradzieza przez innego gracza (!rob). Zuzywana przy probie robu.',
      type: 'stackable'
    },
    piwo: {
      name: 'Piwo',
      emoji: '🍺',
      price: 50000,
      description: 'Uzyj przed !rob: 50% szans na +5% wiekszy lup (25% zamiast 20%), ale przy wpadce tracisz 40% zamiast 30%.',
      type: 'stackable'
    },
    ticket: {
      name: 'Bilet Loterii',
      emoji: '🎟️',
      price: 50000,
      description: 'Bilet na loterię (losowanie co 10 min, max 5 szt.).',
      type: 'stackable'
    }
  },
  badges: {
    vip: 'VIP',
    rich: 'Rich',
    grinder: 'Grinder',
    gambler: 'Gambler',
    married: 'Married',
    premium: 'Premium'
  }
};
