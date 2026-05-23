const { formatCurrency, refreshBadges, ensureInventoryRecord } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'bal',
  aliases: ['balance', 'kasa', 'saldo'],
  async execute(client, message, args) {
    let targetId = message.author.id;
    let targetName = message.author.username || `Uzytkownik_${targetId.slice(-6)}`;

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = args[0];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      // Sprawdź czy mamy w cache
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    const snapshot = await withData(store => {
      const user = createUser(targetId, store.users);
      refreshBadges(user, ensureInventoryRecord(store.inventory, targetId));
      
      const lastPayout = store.profiles.lastInterestPayout || Date.now();
      const nextPayout = lastPayout + 12 * 60 * 60 * 1000;
      const nextInterestMs = Math.max(0, nextPayout - Date.now());

      return {
        balance: user.balance,
        bank: user.bank,
        nextInterestMs
      };
    });

    const formatTimeLeft = (ms) => {
      if (ms <= 0) return '0m';
      const totalMinutes = Math.floor(ms / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    await message.reply(
      `💰 Saldo — **${targetName}**\n` +
      `👛 Portfel: ${formatCurrency(snapshot.balance)}\n` +
      `🏦 Bank: ${formatCurrency(snapshot.bank)}\n` +
      `📈 Kolejne odsetki: za **${formatTimeLeft(snapshot.nextInterestMs)}**`
    );
  }
};
