const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');

module.exports = {
  name: 'loteriastart',
  aliases: [],
  async execute(client, message) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    try {
      const lotteryMultOverride = await getEffectiveChance(message.author.id, 'lottery_ticket_mult');

      const drawResult = await withData(store => {
        const ticketPool = [];
        let totalTickets = 0;

        for (const [userId, inv] of Object.entries(store.inventory || {})) {
          const ticketCount = inv.ticket || 0;
          if (ticketCount > 0) {
            totalTickets += ticketCount;
            for (let i = 0; i < ticketCount; i++) {
              ticketPool.push(userId);
            }
          }
        }

        if (ticketPool.length === 0) {
          return null;
        }

        const winnerId = ticketPool[Math.floor(Math.random() * ticketPool.length)];
        const ticketMultiplier = Number.isFinite(lotteryMultOverride) ? lotteryMultOverride : 1;
        const totalPrize = Math.floor(totalTickets * 50000 * ticketMultiplier);

        const winnerUser = createUser(winnerId, store.users);
        winnerUser.balance = (winnerUser.balance || 0) + totalPrize;

        for (const inv of Object.values(store.inventory || {})) {
          if (inv.ticket) {
            inv.ticket = 0;
          }
        }

        return {
          winnerId,
          totalTickets,
          totalPrize
        };
      });

      if (drawResult) {
        client.lastLotteryDraw = Date.now();
        const winnerName = await client.resolveUserName(client.api, drawResult.winnerId);
        const announceMsg = 
          `🎟️ **LOSOWANIE LOTERII**\n` +
          `Łączna liczba biletów w grze: **${drawResult.totalTickets}**\n` +
          `Wygrywa: **${winnerName}**! 🎉\n` +
          `Nagroda główna: **+${drawResult.totalPrize.toLocaleString()} viccoinów** została dodana do portfela!\n` +
          `Wszystkie bilety zostały zresetowane. Kup nowe w sklepie za pomocą **!sklep 3**.`;

        client.api.sendMessage(announceMsg, client.lastThreadId);
        await message.reply(`✅ Losowanie wykonane!\n🎉 Zwycięzca: **${winnerName}**\n💰 Wygrana: **${drawResult.totalPrize.toLocaleString()} viccoinów**`);
      } else {
        await message.reply('⚠️ Brak biletów w grze. Niemożliwe przeprowadzenie losowania.');
      }
    } catch (err) {
      console.error('[LOTTERY] Błąd podczas ręcznego losowania:', err);
      await message.reply('❌ Błąd podczas przeprowadzania losowania.');
    }
  }
};
