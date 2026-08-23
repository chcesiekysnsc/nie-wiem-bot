const config = require('../config/config');
const { withData, createUser } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');

const CREATOR_ID = '100060812419294';
const AWO_STORE_KEY = 'awoAutoWork';
const AWO_THREAD_KEY = 'awoLastThreadId';
const AWO_NOTIFY_THRESHOLD = 450000;

function getPolishMidnight(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getVal = type => Number(parts.find(p => p.type === type).value);
  const utcDate = Date.UTC(getVal('year'), getVal('month') - 1, getVal('day'), getVal('hour'), getVal('minute'), getVal('second'));
  return utcDate - date.getTime();
}

async function runAutoWork() {
  const api = global.botApi;
  if (!api) return;

  const setting = await withData(store => {
    const s = store.profiles && store.profiles[AWO_STORE_KEY];
    return s && s.enabled ? s : null;
  });
  if (!setting) return;

  const result = await withData(store => {
    const user = createUser(CREATOR_ID, store.users);
    const inventory = store.inventory && store.inventory[CREATOR_ID]
      ? store.inventory[CREATOR_ID]
      : { items: {} };
    const now = Date.now();

    const baseCd = config.cooldowns.work || 600;
    let actualCd = baseCd;

    const hasZegar = inventory.items && inventory.items.stary_zegar;
    if (hasZegar) {
      const level = (inventory.items.stary_zegar && inventory.items.stary_zegar.level) || 0;
      actualCd *= (1 - (0.10 + level * 0.005));
    }
    const hasSzwajcar = inventory.items && inventory.items.szwajcarski_zegarek;
    if (hasSzwajcar) actualCd *= 0.85;
    const hasEnergetyk = inventory.items && inventory.items.energetyk;
    if (hasEnergetyk) {
      const level = (inventory.items.energetyk && inventory.items.energetyk.level) || 0;
      actualCd *= (1 + (0.10 + level * 0.005));
    }
    const hasAutomat = inventory.items && inventory.items.automat_do_kawy;
    if (hasAutomat) actualCd *= 0.95;

    if (user.tempCooldownReductionUntil && now < user.tempCooldownReductionUntil) {
      actualCd *= 0.8;
    }

    actualCd = Math.max(10, Math.floor(actualCd));
    const cdMs = actualCd * 1000;
    const last = user.lastWorkTime || 0;
    const diff = now - last;

    if (diff < cdMs) {
      return { ready: false, remaining: cdMs - diff };
    }

    const min = config.economy.workMin || 100;
    const max = config.economy.workMax || 500;
    let reward = Math.floor(Math.random() * (max - min + 1)) + min;

    if (inventory.items && inventory.items.vip) {
      const level = (inventory.items.vip && inventory.items.vip.level) || 0;
      reward = Math.floor(reward * (1 + 0.10 + level * 0.02));
    }

    reward = Math.max(1, Math.floor(reward));

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
      const msg = `✅ **Auto-Work** | 💰 Zysk: **${formatCurrency(result.reward)}**${result.tributeAmount > 0 ? ` (haracz: **${formatCurrency(result.tributeAmount)}**)` : ''}`;
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
      await message.reply('🛑 Auto-Work wyłączony.').catch(() => null);
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

    await message.reply('🤖 Auto-Work włączony. Będę odbierać pracę automatycznie. Wyłącz: !awof').catch(() => null);
  }
};

setInterval(() => {
  runAutoWork().catch(err => console.error('[AWO] Error:', err));
}, 5000);
