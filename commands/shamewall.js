const { withData } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');

module.exports = {
  name: 'shamewall',
  aliases: ['murwstydu', 'zadluzeni', 'dluznicy'],
  async execute(client, message, args) {
    const list = await withData(async (store) => {
      const debtors = [];
      for (const [userId, user] of Object.entries(store.users)) {
        if (user && user.activeLoan && user.activeLoan.amount > 0) {
          debtors.push({
            id: userId,
            amount: user.activeLoan.amount,
            originalAmount: user.activeLoan.originalAmount
          });
        }
      }
      return debtors;
    });

    if (list.length === 0) {
      await message.reply('🏛️ **Mur Wstydu (Najbardziej zadłużeni globalnie):**\n\nAktualnie nikt nie posiada aktywnego długu w banku wirtualnym! Czysto.');
      return;
    }

    // Sort by current loan amount descending
    list.sort((a, b) => b.amount - a.amount);
    const topDebtors = list.slice(0, 5);

    let response = '🏛️ **Mur Wstydu (Top 5 najbardziej zadłużonych globalnie):**\n\n';
    let rank = 1;
    for (const debtor of topDebtors) {
      const name = (client.userNames && client.userNames.get(debtor.id)) || `Użytkownik_${debtor.id.slice(-6)}`;
      response += `${rank}. **${name}** (ID: ${debtor.id})\n` +
                  `   💰 Kwota do spłaty: **${formatCurrency(debtor.amount)}** (Zaciągnięto: ${formatCurrency(debtor.originalAmount)})\n`;
      rank++;
    }

    await message.reply(response);
  }
};
