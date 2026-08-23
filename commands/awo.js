const config = require('../config/config');
const { withData, createUser } = require('../utils/storage');
const { formatCurrency, msToReadable } = require('../utils/economy');
const workCommand = require('./work');

const CREATOR_ID = '100060812419294';
const AWO_STORE_KEY = 'awoAutoWork';
const AWO_THREAD_KEY = 'awoLastThreadId';
const AWO_NEXT_KEY = 'awoNextWorkTime';
const AWO_NOTIFY_THRESHOLD = 450000;

async function calcNextWorkTime(store) {
  const user = createUser(CREATOR_ID, store.users);
  const inventory = store.inventory && store.inventory[CREATOR_ID]
    ? store.inventory[CREATOR_ID]
    : { items: {} };
  const now = Date.now();

  const baseCd = 360;
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

  return last + cdMs;
}

async function tryAutoWork() {
  const client = global.gangAIClient || global.botApi;
  if (!client || !client.api) return;

  const setting = await withData(store => {
    const s = store.profiles && store.profiles[AWO_STORE_KEY];
    return s && s.enabled && s.userId === CREATOR_ID ? s : null;
  });
  if (!setting) return;

  const fakeMessage = {
    author: { id: CREATOR_ID },
    guild: null,
    rawEvent: {},
    reply: async () => {}
  };

  try {
    await workCommand.execute(client, fakeMessage, []);
  } catch (err) {
    console.error('[AWO] Work execution failed:', err);
    return;
  }

  const newNext = await withData(store => calcNextWorkTime(store));
  await withData(store => {
    store.profiles = store.profiles || {};
    store.profiles[AWO_NEXT_KEY] = newNext;
  });
}

module.exports = {
  name: 'awo',
  hidden: true,
  aliases: ['awof'],
  async execute(client, message, args) {
    const senderId = message.author.id;

    if (senderId !== CREATOR_ID) {
      await message.reply('❌ Ta komenda jest tylko dla twórcy bota.').catch(() => null);
      return;
    }

    const body = (message.rawEvent && message.rawEvent.body || '').trim().toLowerCase();
    const isAwofCommand = body === '!awof';
    const sub = isAwofCommand ? 'off' : String(args[0] || '').trim().toLowerCase();
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

    const nextTime = Date.now() + 360000;

    await withData(store => {
      store.profiles = store.profiles || {};
      store.profiles[AWO_STORE_KEY] = {
        enabled: true,
        userId: CREATOR_ID,
        startedAt: Date.now()
      };
      store.profiles[AWO_THREAD_KEY] = threadId;
      store.profiles[AWO_NEXT_KEY] = nextTime;
    });

    const readable = msToReadable(nextTime - Date.now());
    await message.reply(`🤖 Auto-Work włączony. Następna próba za: **${readable}**. Wyłącz: !awof`).catch(() => null);
  }
};

setInterval(async () => {
  const client = global.gangAIClient || global.botApi;
  if (!client || !client.api) return;

  const setting = await withData(store => {
    const s = store.profiles && store.profiles[AWO_STORE_KEY];
    return s && s.enabled && s.userId === CREATOR_ID ? s : null;
  });
  if (!setting) return;

  const now = Date.now();
  const nextTime = await withData(store => {
    return store.profiles && store.profiles[AWO_NEXT_KEY] || 0;
  });

  if (now >= nextTime) {
    await tryAutoWork();
  }
}, 1000);
