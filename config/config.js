module.exports = {
  prefix: '!',
  admins: ['123456789', '1368942044948594708'],
  logChannelId: '',
  casinoName: 'Golden Dice Casino',
  currencyEmoji: '🪙',
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
    work: 10,
    crime: 12,
    rob: 20,
    slots: 4,
    blackjack: 10,
    coinflip: 4,
    roulette: 5,
    leaderboard: 8,
    deposit: 3,
    withdraw: 3,
    shop: 3,
    inventory: 3,
    marry: 12,
    pfp: 4,
    admadd: 2
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
    workMin: 350,
    workMax: 1250,
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
      emoji: '💎',
      price: 30000,
      description: 'Daje bonus do !daily, !work i wieksza pojemnosc banku.',
      type: 'permanent'
    },
    luckycharm: {
      name: 'Lucky Charm',
      emoji: '🍀',
      price: 12000,
      description: 'Zwiesza szczescie w grach losowych.',
      type: 'stackable'
    },
    robshield: {
      name: 'Rob Shield',
      emoji: '🛡️',
      price: 15000,
      description: 'Blokuje jedna udana probe kradziezy.',
      type: 'stackable'
    },
    premiumbadge: {
      name: 'Premium Badge',
      emoji: '✨',
      price: 18000,
      description: 'Dodaje premium badge na profilu.',
      type: 'permanent'
    },
    goldencard: {
      name: 'Golden Card',
      emoji: '💳',
      price: 40000,
      description: 'Mocno zwieksza pojemnosc banku.',
      type: 'permanent'
    }
  },
  badges: {
    vip: '💎 VIP',
    rich: '👑 Rich',
    grinder: '🎯 Grinder',
    gambler: '🎰 Gambler',
    married: '💍 Married',
    premium: '✨ Premium',
    lucky: '🍀 Lucky'
  }
};
