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

    const list = await withData(store => {
      const debtors = [];
      for (const [userId, user] of Object.entries(store.users)) {
        if (user && user.activeLoan && user.activeLoan.amount > 0) {
          let name = `Uzytkownik_${userId.slice(-6)}`;
          if (client.userNames && typeof client.userNames.get === 'function') {
            name = client.userNames.get(userId) || name;
          } else if (client.getUser && typeof client.getUser === 'function') {
            const platformUser = client.getUser(userId);
            if (platformUser && platformUser.username) {
              name = platformUser.username;
            }
          }
          const elapsed = Date.now() - user.activeLoan.takenAt;
          const remainingRepayMs = Math.max(0, 48 * 60 * 60 * 1000 - elapsed);
          
          debtors.push({
            id: userId,
            name,
            originalAmount: user.activeLoan.originalAmount,
            amount: user.activeLoan.amount,
            remainingTimeStr: msToReadable(remainingRepayMs)
          });
        }
      }
      return debtors;
    });

    if (list.length === 0) {
      await message.reply('🏦 **Dłużnicy**\nBrak aktywnych pożyczek w systemie.');
      return;
    }

    let response = `🏦 **LISTA DŁUŻNIKÓW** 🏦\n`;
    response += `----------------------------------------\n`;
    let totalDebt = 0;
    list.forEach((d, idx) => {
      response += `${idx + 1}. 👤 **${d.name}** (ID: \`${d.id}\`)\n`;
      response += `   • Dług pierwotny: **${formatCurrency(d.originalAmount)}**\n`;
      response += `   • Aktualnie do spłaty: **${formatCurrency(d.amount)}**\n`;
      response += `   • Czas do auto-spłaty: **${d.remainingTimeStr}**\n\n`;
      totalDebt += d.amount;
    });
    response += `----------------------------------------\n`;
    response += `📈 Łączny dług w systemie: **${formatCurrency(totalDebt)}**`;

    await message.reply(response);
  }
};
