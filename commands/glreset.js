const { withData } = require('../utils/storage');

module.exports = {
  name: 'glreset',
  aliases: [],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const reason = (args || []).join(' ').trim();
    if (!reason) {
      await message.reply('❌ Użyj: **!glreset <treść>**');
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let allowed = false;
    let lastMonth = null;
    let lastYear = null;
    let nextAllowedLabel = '';

    await withData(store => {
      const profiles = store.profiles || {};
      lastMonth = profiles.globalResetLastMonth;
      lastYear = profiles.globalResetLastYear;

      if (lastMonth === undefined || lastYear === undefined) {
        allowed = true;
      } else {
        const currentIndex = currentYear * 12 + currentMonth;
        const lastIndex = lastYear * 12 + lastMonth;
        allowed = currentIndex - lastIndex >= 2;
        if (!allowed) {
          const nextDate = new Date(lastYear, lastMonth + 2, 1);
          nextAllowedLabel = nextDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
        }
      }

      if (!allowed) {
        return;
      }

      for (const uid of Object.keys(store.users)) {
        const user = store.users[uid];
        if (user) {
          user.balance = 0;
          user.bank = 0;
        }
      }

      if (!store.profiles) store.profiles = {};
      store.profiles.gangs = {};
      store.profiles.globalResetLastMonth = currentMonth;
      store.profiles.globalResetLastYear = currentYear;
    });

    if (!allowed) {
      await message.reply(`⏳ Globalny reset jest możliwy najwcześniej **${nextAllowedLabel}**.`);
      return;
    }

    await message.reply(`✅ Globalny reset wykonany.\n\n${reason}`);
  }
};
