const { withData } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');

module.exports = {
  name: 'shamewall',
  aliases: ['scianawstydu', 'zadluzeni', 'dluznicy'],
  async execute(client, message, args) {
    async function resolveName(userId) {
      if (client.resolvedUserNames && client.resolvedUserNames.has(userId) && client.userNames.has(userId)) {
        return client.userNames.get(userId);
      }
      if (client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const info = await new Promise((resolve) => {
            client.api.getUserInfo(userId, (err, ret) => {
              if (!err && ret && ret[userId]) {
                const name = ret[userId].name;
                client.userNames.set(userId, name);
                if (client.resolvedUserNames) {
                  client.resolvedUserNames.add(userId);
                }
                resolve(name);
              } else {
                resolve(null);
              }
            });
          });
          if (info) return info;
        } catch (_) {}
      }
      if (typeof client.resolveUserName === 'function') {
        try {
          return await client.resolveUserName(userId);
        } catch (_) {}
      }
      return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
    }

    const list = await withData(async (store) => {
      const users = [];
      for (const [userId, user] of Object.entries(store.users)) {
        if (user) {
          const borrowed = user.activeLoan ? user.activeLoan.amount : 0;
          const netBalance = (user.balance || 0) + (user.bank || 0) - borrowed;
          users.push({
            id: userId,
            netBalance
          });
        }
      }
      return users;
    });

    if (list.length === 0) {
      await message.reply('🏛️ **Ściana Wstydu (Najmniejsze saldo globalnie):**\n\nBrak zarejestrowanych użytkowników.');
      return;
    }

    // Sort by net balance ascending (lowest balance first)
    list.sort((a, b) => a.netBalance - b.netBalance);
    const topDebtors = list.slice(0, 5);

    let response = '🏛️ **Ściana Wstydu (Top 5 najmniejszych sald globalnie):**\n\n';
    let rank = 1;
    for (const debtor of topDebtors) {
      const name = await resolveName(debtor.id);
      response += `${rank}. **${name}** (ID: ${debtor.id}) — **${formatCurrency(debtor.netBalance)}**\n`;
      rank++;
    }

    await message.reply(response);
  }
};
