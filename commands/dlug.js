const config = require('../config/config');
const { formatCurrency, msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'dlug',
  aliases: ['dlugi', 'debts', 'debtors'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    const action = String(args[0] || '').trim().toLowerCase();
    if (action !== 'lista') {
      await message.reply('❌ Użyj: `!dlug lista`');
      return;
    }

    async function getName(id) {
      if (client.resolvedUserNames && client.resolvedUserNames.has(id) && client.userNames.has(id)) {
        return client.userNames.get(id);
      }
      if (client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const info = await new Promise((resolve) => {
            client.api.getUserInfo(id, (err, ret) => {
              if (!err && ret && ret[id]) {
                const name = ret[id].name;
                if (client.userNames) client.userNames.set(id, name);
                if (client.resolvedUserNames) client.resolvedUserNames.add(id);
                resolve(name);
              } else {
                resolve(null);
              }
            });
          });
          if (info) return info;
        } catch (_) {}
      }
      if (client.fetchUser && typeof client.fetchUser === 'function') {
        try {
          const platformUser = await client.fetchUser(id);
          if (platformUser && platformUser.profile && platformUser.profile.name) {
            return platformUser.profile.name;
          }
        } catch (_) {}
      }
      return (client.userNames && client.userNames.get(id)) || `Uzytkownik_${String(id).slice(-6)}`;
    }

    const debtorsData = await withData(store => {
      const debtors = [];
      for (const [userId, user] of Object.entries(store.users)) {
        if (user && user.activeLoan && user.activeLoan.amount > 0) {
          debtors.push({
            id: userId,
            originalAmount: user.activeLoan.originalAmount,
            amount: user.activeLoan.amount,
            takenAt: user.activeLoan.takenAt
          });
        }
      }
      return debtors;
    });

    if (debtorsData.length === 0) {
      await message.reply('🏦 **Dłużnicy**\nBrak aktywnych pożyczek w systemie.');
      return;
    }

    const list = await Promise.all(debtorsData.map(async (d) => {
      const name = await getName(d.id);
      const elapsed = Date.now() - d.takenAt;
      const remainingRepayMs = Math.max(0, 48 * 60 * 60 * 1000 - elapsed);
      
      return {
        ...d,
        name,
        remainingTimeStr: msToReadable(remainingRepayMs)
      };
    }));

    let response = `🏦 **LISTA DŁUŻNIKÓW** 🏦\n`;
    response += `----------------------------------------\n`;
    let totalDebt = 0;
    list.forEach((d, idx) => {
      response += `${idx + 1}. 👤 **${d.name}** (\`${d.id}\`) — **${formatCurrency(d.amount)}** (pierwotnie: **${formatCurrency(d.originalAmount)}**, spłata za: **${d.remainingTimeStr}**)\n`;
      totalDebt += d.amount;
    });
    response += `----------------------------------------\n`;
    response += `📈 Łączny dług w systemie: **${formatCurrency(totalDebt)}**`;

    await message.reply(response);
  }
};
