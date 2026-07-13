const { loadData } = require('../utils/storage');

const TYPE_NAMES = {
  xp: '⚡ XP',
  casino: '🎰 Kasyno',
  items: '📦 Itemy',
  cooldowns: '⚡ Szybsze cooldowny',
  shop_discount: '🛒 Przecena w sklepie',
  bank_interest: '🏦 Bankowy Raj',
  crime_luck: '🌑 Czarna Godzina',
  company_payout: '🪙 Midasowy Dotyk'
};

function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
}

module.exports = {
  name: 'eventy',
  aliases: ['event', 'aktywneeventy'],
  async execute(client, message, args) {
    const profiles = loadData('profiles') || {};
    const now = Date.now();
    const activeEvents = (profiles.events || []).filter(e => e.endTime > now);

    if (activeEvents.length === 0) {
      await message.reply('ℹ️ Obecnie nie ma żadnych aktywnych eventów.');
      return;
    }

    const lines = activeEvents.map(e => {
      const name = TYPE_NAMES[e.type] || e.type;
      let bonusLabel;
      if (e.type === 'cooldowns' || e.type === 'shop_discount') {
        const pct = e.reductionPercent != null ? Math.round(Number(e.reductionPercent)) : Math.round((1 - Number(e.multiplier || 1)) * 100);
        bonusLabel = `-${pct}%`;
      } else {
        bonusLabel = `x${e.multiplier}`;
      }
      const remaining = formatRemaining(e.endTime - now);
      const desc = e.description ? `\n   _${e.description}_` : '';
      return `🟢 **${name}** ${bonusLabel} — kończy się za: **${remaining}**${desc}`;
    });

    await message.reply(`🎉 **AKTYWNE EVENTY**\n\n${lines.join('\n\n')}`);
  }
};
