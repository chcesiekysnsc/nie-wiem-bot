const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'loteriastart',
  aliases: [],
  async execute(client, message) {
    // Sprawdzenie czy user jest adminem
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla administratorów.');
      return;
    }

    try {
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
        const totalPrize = totalTickets * 50000;

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
          `Nagroda główna: **+${drawResult.totalPrize.toLocaleString()} Coins** została dodana do portfela!\n` +
          `Wszystkie bilety zostały zresetowane. Kup nowe w sklepie za pomocą \`!sklep 5\`.`;

        client.api.sendMessage(announceMsg, client.lastThreadId);
        await message.reply(`✅ Losowanie wykonane!\n🎉 Zwycięzca: **${winnerName}**\n💰 Wygrana: **${drawResult.totalPrize.toLocaleString()} Coins**`);
      } else {
        await message.reply('⚠️ Brak biletów w grze. Niemożliwe przeprowadzenie losowania.');
      }
    } catch (err) {
      console.error('[LOTTERY] Błąd podczas ręcznego losowania:', err);
      await message.reply('❌ Błąd podczas przeprowadzania losowania.');
    }
  }
};
