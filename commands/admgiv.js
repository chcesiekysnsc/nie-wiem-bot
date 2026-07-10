const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'admgiv',
  aliases: ['giveall'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const amount = resolveAmount(args[0], 999999999999);
    if (!amount || amount <= 0) {
      await message.reply('❌ Użyj: **!admgiv <kwota>**');
      return;
    }

    const threadId = message.guild.id;

    // Pobierz ID uczestników wątku
    let participantIDs = [];
    if (client.api && typeof client.api.getThreadInfo === 'function') {
      try {
        const info = await new Promise((resolve, reject) => {
          client.api.getThreadInfo(threadId, (err, ret) => {
            if (err) return reject(err);
            resolve(ret);
          });
        });
        if (info && info.participantIDs) {
          participantIDs = info.participantIDs;
        }
      } catch (e) {
        console.error('[admgiv] Błąd pobierania uczestników:', e.message);
      }
    }

    // Fallback: jeśli brak danych z API, weź z logów aktywności
    if (participantIDs.length === 0) {
      const logs = await withData(store => {
        return (store.logs || [])
          .filter(l => l.threadID === threadId)
          .map(l => l.userId)
          .filter(Boolean);
      });
      participantIDs = [...new Set(logs)];
    }

    // Upewnij się, że jest chociaż autor wiadomości
    if (participantIDs.length === 0) {
      participantIDs = [message.author.id];
    }

    // Rozdaj kasę w bazie
    const count = await withData(store => {
      let updatedCount = 0;
      for (const uid of participantIDs) {
        const user = createUser(uid, store.users);
        if ((user.commandsUsed || 0) <= 20) {
          continue;
        }
        const inventory = ensureInventoryRecord(store.inventory, uid);
        user.balance += amount;
        refreshBadges(user, inventory);
        updatedCount++;
      }
      return updatedCount;
    });

    await message.reply(`🎁 Admin rozdał po **${formatCurrency(amount)}** dla uczestników grupy mających ponad 20 użytych komend! (Rozdano do: ${count} osób)`);
  }
};
