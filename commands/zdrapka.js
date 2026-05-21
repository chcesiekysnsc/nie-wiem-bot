const { formatCurrency, recordGame, refreshBadges } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const COST = 5000;

function getRandomPrize() {
  const r = Math.random();
  if (r < 0.70) {
    // 70% szansy na małą wygraną: 1 000 - 4 000
    return Math.floor(Math.random() * 3001) + 1000;
  } else if (r < 0.90) {
    // 20% szansy na średnią wygraną: 5 000 - 15 000
    return Math.floor(Math.random() * 10001) + 5000;
  } else if (r < 0.98) {
    // 8% szansy na dużą wygraną: 20 000 - 50 000
    return Math.floor(Math.random() * 30001) + 20000;
  } else {
    // 2% szansy na jackpot: 100 000 - 500 000
    return Math.floor(Math.random() * 400001) + 100000;
  }
}

module.exports = {
  name: 'zdrapka',
  aliases: ['scratch'],
  async execute(client, message, args) {
    const authorId = message.author.id;

    const result = await withData(store => {
      const user = createUser(authorId, store.users);
      const inventory = store.inventory[authorId] || { items: {} }; // upewnij się, że nie rzuci błędu

      if (user.balance < COST) {
        return { error: `❌ Nie masz wystarczająco środków w portfelu. Zdrapka kosztuje **${formatCurrency(COST)}**.` };
      }

      // Pobierz koszt zdrapki
      user.balance -= COST;

      const winningNum = Math.floor(Math.random() * 10) + 1;
      const fields = [];
      let totalWon = 0;

      for (let i = 0; i < 3; i++) {
        const num = Math.floor(Math.random() * 10) + 1;
        const prize = getRandomPrize();
        const isMatch = num === winningNum;
        
        if (isMatch) {
          totalWon += prize;
        }
        
        fields.push({ num, prize, isMatch });
      }

      // Jeśli wygrał, dodaj kwotę do balansu
      if (totalWon > 0) {
        user.balance += totalWon;
      }

      const net = totalWon - COST;
      recordGame(user, net);
      refreshBadges(user, inventory);

      return {
        success: true,
        winningNum,
        fields,
        totalWon,
        balance: user.balance
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    // Formatowanie wyniku zdrapki
    const fieldsText = result.fields.map((f, i) => {
      const matchIndicator = f.isMatch ? ' 🌟 WYGRANA! 💸' : '';
      return `${i + 1}. Liczba: **[ ${f.num} ]** | Nagroda: **${formatCurrency(f.prize)}**${matchIndicator}`;
    }).join('\n');

    let outcomeText = '';
    if (result.totalWon > 0) {
      outcomeText = `🎉 **Gratulacje!** Trafiłeś zwycięską liczbę **${result.winningNum}** i wygrałeś łącznie **${formatCurrency(result.totalWon)}**!`;
    } else {
      outcomeText = `😢 Niestety, tym razem nic nie wygrałeś. Spróbuj ponownie!`;
    }

    const response = 
      `🎫 **ZDRAPKA KASYNOWA** (Koszt: **${formatCurrency(COST)}**)\n` +
      `--------------------------------------\n` +
      `🌟 Zwycięska liczba: **[ ${result.winningNum} ]**\n\n` +
      `🎫 Twoje pola:\n` +
      `${fieldsText}\n` +
      `--------------------------------------\n` +
      `${outcomeText}\n` +
      `👛 Twój nowy balans: **${formatCurrency(result.balance)}**`;

    await message.reply(response);
  }
};
