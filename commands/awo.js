const config = require('../config/config');
const { withData, createUser } = require('../utils/storage');
const {
  formatCurrency,
  getRandomXp,
  getItemSetBonus,
  getPassiveMultiplier,
  getActiveEventMultiplier,
  getGlobalIncomeMultiplier,
  getGlobalCooldownReduction,
  getItemUpgradeLevel,
  getWorkLevelBonus,
  getHouseWorkBonus,
  msToReadable,
  randomInt
} = require('../utils/economy');

const CREATOR_ID = '100060812419294';
const AWO_STORE_KEY = 'awoAutoWork';
const AWO_THREAD_KEY = 'awoLastThreadId';
const AWO_NOTIFY_THRESHOLD = 450000;

function getWorkLevelTitle(level) {
  if (level <= 4) return 'Praktykant';
  if (level <= 9) return 'Specjalista';
  if (level <= 14) return 'Ekspert';
  if (level <= 19) return 'Mistrz';
  return 'Legenda Pracy';
}

function getPromotionChance(level) {
  if (level <= 4) return 0.17;
  if (level <= 9) return 0.12;
  if (level <= 14) return 0.08;
  if (level <= 19) return 0.05;
  return 0.03;
}

async function runAutoWork(client) {
  if (!client) return;
  const api = client.api || global.botApi;
  if (!api) return;

  const shouldRun = await withData(store => {
    const settings = store.profiles && store.profiles[AWO_STORE_KEY];
    return settings && settings.enabled && settings.userId;
  });

  console.log('[AWO] runAutoWork called, shouldRun:', shouldRun);

  if (!shouldRun) return;

  const result = await withData(store => {
    const user = createUser(CREATOR_ID, store.users);
    const inventory = store.inventory && store.inventory[CREATOR_ID]
      ? store.inventory[CREATOR_ID]
      : { items: {} };
    const now = Date.now();

    const baseCd = config.cooldowns.work || 600;
    let actualCd = baseCd;

    const hasZegar = inventory.items && inventory.items.stary_zegar;
    const hasSzwajcar = inventory.items && inventory.items.szwajcarski_zegarek;
    const hasEnergetyk = inventory.items && inventory.items.energetyk;
    const hasAutomat = inventory.items && inventory.items.automat_do_kawy;

    if (hasZegar) {
      const level = getItemUpgradeLevel(inventory, 'stary_zegar');
      const reduction = 0.10 + level * 0.005;
      actualCd *= (1 - reduction);
    }
    if (hasSzwajcar) actualCd *= 0.85;
    if (hasEnergetyk) {
      const level = getItemUpgradeLevel(inventory, 'energetyk');
      const increase = 0.10 + level * 0.005;
      actualCd *= (1 + increase);
    }

    const cdReduction = getGlobalCooldownReduction(inventory);
    if (cdReduction > 0) {
      actualCd = Math.floor(actualCd * (1 - cdReduction));
    }

    const evMul = getActiveEventMultiplier('cooldowns');
    if (evMul && evMul > 1) {
      actualCd = Math.floor(actualCd / evMul);
    }

    if (user.tempCooldownReductionUntil && now < user.tempCooldownReductionUntil) {
      actualCd = Math.floor(actualCd * 0.8);
    }

    if (hasAutomat) {
      actualCd = Math.floor(actualCd * 0.95);
    }

    const cdMs = actualCd * 1000;
    const last = user.lastWorkTime || 0;
    const diff = now - last;

    if (diff < cdMs) {
      return { ready: false, remaining: cdMs - diff };
    }

    const workLevel = Math.max(1, user.workLevel || 1);
    const workLevelBonus = 1 + getWorkLevelBonus(workLevel) / 100;

    let reward = randomInt(config.economy.workMin, config.economy.workMax);
    reward = Math.floor(reward * workLevelBonus);

    if (inventory.items && inventory.items.vip) {
      const level = getItemUpgradeLevel(inventory, 'vip');
      const bonus = 0.10 + level * 0.02;
      reward = Math.floor(reward * (1 + bonus));
    }

    const setWorkBonus = getItemSetBonus(inventory, 'work_xp');
    if (setWorkBonus > 0) {
      reward = Math.floor(reward * (1 + setWorkBonus));
    }

    const tripleChance = getItemSetBonus(inventory, 'work_triple_chance');
    if (tripleChance > 0 && Math.random() < tripleChance) {
      reward = reward * 3;
    }

    const gangBonus = 0;
    if (user.gangId && store.profiles && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
      const gang = store.profiles.gangs[user.gangId];
      const idxBiz = gang.levelBiznesy || 0;
      const multipliers = [1.0, 1.10, 1.20, 1.30];
      const multiplier = multipliers[idxBiz] || 1.0;
      reward = Math.floor(reward * multiplier);
    }

    let tributeAmount = 0;
    if (user.gangId && store.profiles && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
      const gang = store.profiles.gangs[user.gangId];
      const tributePercent = gang.tributePercent || 0;
      const isExcluded = user.gangRole === 'boss' || user.gangRole === 'deputy';
      if (tributePercent > 0 && !isExcluded) {
        tributeAmount = Math.floor(reward * (tributePercent / 100));
        user.balance += reward - tributeAmount;
        gang.vault += tributeAmount;
        const bossUser = createUser(gang.bossId, store.users);
        bossUser.balance += tributeAmount;
      } else {
        user.balance += reward;
      }
    } else {
      user.balance += reward;
    }

    user.lastWorkTime = now;

    return {
      ready: true,
      reward,
      tributeAmount,
      notified: reward >= AWO_NOTIFY_THRESHOLD
    };
  });

  if (!result || !result.ready) return;

  if (result.notified) {
    const threadId = await withData(store => {
      return store.profiles && store.profiles[AWO_THREAD_KEY] || null;
    });

    if (threadId && api) {
      const msg = `✅ **Auto-Work:** automatyczny odbiór pracy zakończony!\n💰 Zysk: **${formatCurrency(result.reward)}**${result.tributeAmount > 0 ? ` (pobrano **${formatCurrency(result.tributeAmount)}** haraczu)` : ''}`;
      api.sendMessage(msg, threadId, () => {});
    }
  }
}

module.exports = {
  name: 'awo',
  hidden: true,
  aliases: [],
  async execute(client, message, args) {
    const senderId = message.author.id;

    if (senderId !== CREATOR_ID) {
      await message.reply('❌ Ta komenda jest tylko dla twórcy bota.').catch(() => null);
      return;
    }

    const sub = String(args[0] || '').trim().toLowerCase();
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    if (sub === 'off' || sub === 'stop' || sub === 'wylacz') {
      await withData(store => {
        store.profiles = store.profiles || {};
        if (store.profiles[AWO_STORE_KEY]) {
          store.profiles[AWO_STORE_KEY].enabled = false;
        }
      });

      await message.reply('🛑 Auto-Work został wyłączony.').catch(() => null);
      return;
    }

    if (!threadId) {
      await message.reply('❌ Użyj komendy w grupie, aby włączyć Auto-Work dla tej grupy.').catch(() => null);
      return;
    }

    await withData(store => {
      store.profiles = store.profiles || {};
      store.profiles[AWO_STORE_KEY] = {
        enabled: true,
        userId: CREATOR_ID,
        startedAt: Date.now()
      };
      store.profiles[AWO_THREAD_KEY] = threadId;
    });

    await message.reply(`🤖 **Auto-Work włączony!**\nBędę automatycznie odbierać pracy.\nPowiadomienie o odbiorze powyżej **${formatCurrency(AWO_NOTIFY_THRESHOLD)}** zostanie wysłane do tej grupy.\nWyłącz: !awof`).catch(() => null);
  }
};

setInterval(() => {
  const client = global.gangAIClient || global.botApi;
  if (client) {
    runAutoWork(client).catch(err => {
      console.error('[AWO] Auto-work error:', err);
    });
  }
}, 60000);
