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
      const nextPayout = lastPayout + 6 * 60 * 60 * 1000;
      const nextInterestMs = Math.max(0, nextPayout - Date.now());
      
      // Oblicz procent odsetek
      const { getBankInterestMultiplier } = require('../utils/economy');
      const interestRate = getBankInterestMultiplier();
      const interestPercent = Math.round(interestRate * 100);

      return {
        balance: user.balance,
        bank: user.bank,
        nextInterestMs,
        interestPercent,
        activeLoan: user.activeLoan ? { 
          originalAmount: user.activeLoan.originalAmount,
          amount: user.activeLoan.amount,
          rate: user.activeLoan.rate,
          takenAt: user.activeLoan.takenAt,
          lastInterestApplied: user.activeLoan.lastInterestApplied
        } : null
      };
    });

    const formatTimeLeft = (ms) => {
      if (ms <= 0) return '0m';
      const totalMinutes = Math.floor(ms / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    let walletText = formatCurrency(snapshot.balance);
    let loanInfo = '';
    if (snapshot.activeLoan) {
      const ownBal = snapshot.balance - snapshot.activeLoan.originalAmount;
      walletText = `${formatCurrency(ownBal)} (+ ${formatCurrency(snapshot.activeLoan.originalAmount)} z pożyczki)`;
      
      const elapsedInterest = Date.now() - (snapshot.activeLoan.lastInterestApplied || snapshot.activeLoan.takenAt);
      const remainingInterestMs = Math.max(0, 6 * 60 * 60 * 1000 - elapsedInterest);
      const ratePercent = Math.round(snapshot.activeLoan.rate * 100);
      loanInfo = `🛑 Do spłaty: **${formatCurrency(snapshot.activeLoan.amount)}** (za **${formatTimeLeft(remainingInterestMs)}** wzrośnie o **${ratePercent}%**)\n`;
    }

    await message.reply(
      `💰 Saldo — *${targetName}*\n` +
      `👛 Portfel: ${walletText}\n` +
      loanInfo +
      `🏦 Bank: ${formatCurrency(snapshot.bank)}\n` +
      `📈 Kolejne odsetki <${snapshot.interestPercent}%>: za *${formatTimeLeft(snapshot.nextInterestMs)}*`
    );
  }
};
