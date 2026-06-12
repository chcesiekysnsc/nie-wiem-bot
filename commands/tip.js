const { formatCurrency, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

async function resolveName(client, userId) {
  if (typeof client.resolveUserName === 'function') {
    return await client.resolveUserName(userId);
  }
  return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
}

module.exports = {
  name: 'tip',
  aliases: ['przelej', 'daj', 'pay'],
  async execute(client, message, args) {
    let rawAmount = null;
    let targetId = null;
    let targetQuery = null;

    // Pomocnicza funkcja sprawdzająca czy argument wygląda jak kwota
    function isAmountLike(str) {
      if (!str) return false;
      const normalized = str.toLowerCase().trim();
      if (['all', 'max'].includes(normalized)) return true;
      const resolved = resolveAmount(normalized, 1000000);
      return resolved !== null && resolved > 0;
    }

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      // Sprawdź który argument nie jest wzmianką
      const mentionArgIndex = args.findIndex(arg => arg.includes(mentioned.id) || arg.startsWith('@'));
      if (mentionArgIndex === 0) {
        rawAmount = args[1];
      } else {
        rawAmount = args[0];
      }
    } else {
      const arg0 = args[0] || '';
      const arg1 = args[1] || '';

      const isArg0Id = /^\d{8,18}$/.test(arg0);
      const isArg1Id = /^\d{8,18}$/.test(arg1);

      if (isArg0Id && !isArg1Id) {
        targetId = arg0;
        rawAmount = arg1;
      } else if (isArg1Id && !isArg0Id) {
        targetId = arg1;
        rawAmount = arg0;
      } else {
        // Rozróżnianie po tym, który argument jest kwotą
        if (isAmountLike(arg0) && !isAmountLike(arg1)) {
          rawAmount = arg0;
          targetQuery = arg1;
        } else if (isAmountLike(arg1) && !isAmountLike(arg0)) {
          rawAmount = arg1;
          targetQuery = arg0;
        } else {
          // Domyślna kolejność: kwota odbiorca
          rawAmount = arg0;
          targetQuery = arg1;
        }
      }
    }

    if (!rawAmount) {
      await message.reply('❌ Użyj: **!tip <kwota> @osoba** lub **!tip @osoba <kwota>** (obsługuje również ID i nazwy użytkowników).');
      return;
    }

    const result = await withData(store => {
      // Wyszukiwanie użytkownika po nazwie/nicku jeśli nie mamy targetId
      if (!targetId && targetQuery) {
        const cleanQuery = targetQuery.toLowerCase().replace(/^@/, '').trim();
        if (cleanQuery) {
          let foundId = null;
          let foundName = null;

          if (client.userNames) {
            for (const [uid, name] of client.userNames.entries()) {
              if (String(name).toLowerCase().includes(cleanQuery)) {
                foundId = uid;
                foundName = name;
                break;
              }
            }
          }

          if (!foundId && store.users) {
            for (const [uid, user] of Object.entries(store.users)) {
              if (user && user.name && String(user.name).toLowerCase().includes(cleanQuery)) {
                foundId = uid;
                foundName = user.name;
                break;
              }
            }
          }

          if (foundId) {
            targetId = foundId;
          } else {
            return { error: `❌ Nie odnaleziono użytkownika o nazwie pasującej do: **${targetQuery}**` };
          }
        }
      }

      if (!targetId) {
        return { error: '❌ Podaj odbiorcę (oznaczenie, ID lub nazwę użytkownika).' };
      }

      if (store.profiles.blacklist && store.profiles.blacklist.includes(targetId)) {
        return { error: '❌ Ten użytkownik jest zablokowany i nie możesz wchodzić z nim w interakcje.' };
      }

      const sender = createUser(message.author.id, store.users);
      const receiver = createUser(targetId, store.users);

      if (receiver.isMultiAccount) {
        return { error: '❌ Nie możesz przelać pieniędzy na to konto, ponieważ jest ono zablokowane.' };
      }

      const isAll = ['all', 'max'].includes(String(rawAmount || '').toLowerCase());
      let amount = 0;
      if (isAll) {
        amount = sender.balance;
      } else {
        amount = resolveAmount(rawAmount, sender.balance);
      }

      if (!amount || amount <= 0) {
        return { error: '❌ Podaj poprawną kwotę do przelania.' };
      }

      if (targetId === message.author.id) {
        return { error: '❌ Nie możesz przelać pieniędzy samemu sobie.' };
      }

      let lockedAmount = 0;
      if (sender.activeLoan) {
        lockedAmount = sender.activeLoan.originalAmount;
      }

      // Zablokowane środki z pożyczki
      if (lockedAmount > 0 && sender.balance - lockedAmount < amount) {
        return { error: `❌ Te środki są zablokowane z tytułu pożyczki. Wolne środki do przelania: ${formatCurrency(Math.max(0, sender.balance - lockedAmount))}` };
      }

      // Zwykły brak środków (bez pożyczki)
      if (sender.balance < amount) {
        return { error: `❌ Nie masz wystarczających środków. Posiadasz: ${formatCurrency(sender.balance)}` };
      }

      const tax = Math.floor(amount * 0.05);
      const transferAmount = amount - tax;

      sender.balance -= amount;
      receiver.balance += transferAmount;

      sender.tipsSent = sender.tipsSent || {};
      sender.tipsSent[targetId] = (sender.tipsSent[targetId] || 0) + 1;

      return { success: true, amount: transferAmount, tax, senderBalance: sender.balance, targetId };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const finalTargetName = await resolveName(client, result.targetId);
    await message.reply(`💸 Przelano **${formatCurrency(result.amount)}** do **${finalTargetName}**. (Podatek: **${formatCurrency(result.tax)}**)`);
  }
};
