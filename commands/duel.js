const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { saveGameSessions, hasActiveGameSession } = require('../utils/gameStatePersistence');

async function resolveName(client, userId) {
  if (typeof client.resolveUserName === 'function') {
    return await client.resolveUserName(userId);
  }
  return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
}

module.exports = {
  name: 'duel',
  aliases: ['pojedynek'],
  async execute(client, message, args) {
    if (!client.duelRequests) {
      client.duelRequests = new Map();
    }

    const action = String(args[0] || '').toLowerCase();

    // 1. Akceptacja pojedynku
    if (action === 'acc' || action === 'accept') {
      const targetId = message.author.id;
      const request = client.duelRequests.get(targetId);

      if (!request) {
        await message.reply('❌ Nie masz żadnego aktywnego wyzwania na pojedynek.');
        return;
      }

      client.duelRequests.delete(targetId);
      saveGameSessions(client);

      const result = await withData(store => {
        if (store.profiles.blacklist && (store.profiles.blacklist.includes(request.challengerId) || store.profiles.blacklist.includes(targetId))) {
          return { error: '❌ Jeden z graczy jest na czarnej liście i nie można rozegrać pojedynku.' };
        }

        const challenger = createUser(request.challengerId, store.users);
        const target = createUser(targetId, store.users);

        if (challenger.balance < request.amount) {
          return { error: `❌ Wyzywający nie ma już wymaganej kwoty (${formatCurrency(request.amount)}) w portfelu.` };
        }

        if (target.balance < request.amount) {
          return { error: `❌ Nie masz wystarczającej kwoty (${formatCurrency(request.amount)}) w portfelu.` };
        }

        // 50/50 szansa
        const challengerWins = Math.random() < 0.5;

        const tax = Math.floor(request.amount * 0.05);
        const netWin = request.amount - tax;

        if (challengerWins) {
          challenger.balance += netWin;
          target.balance -= request.amount;
        } else {
          challenger.balance -= request.amount;
          target.balance += netWin;
        }

        refreshBadges(challenger, ensureInventoryRecord(store.inventory, request.challengerId));
        refreshBadges(target, ensureInventoryRecord(store.inventory, targetId));

        return {
          success: true,
          challengerWins,
          amount: request.amount,
          netWin,
          tax
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const challengerName = await resolveName(client, request.challengerId);
      const targetName = await resolveName(client, targetId);

      if (result.challengerWins) {
        await message.reply(`⚔️ Pojedynek rozstrzygnięty! Wygrywa **${challengerName}** (+${formatCurrency(result.netWin)} po potrąceniu 5% podatku), przegrywa **${targetName}** (-${formatCurrency(result.amount)}).`);
      } else {
        await message.reply(`⚔️ Pojedynek rozstrzygnięty! Wygrywa **${targetName}** (+${formatCurrency(result.netWin)} po potrąceniu 5% podatku), przegrywa **${challengerName}** (-${formatCurrency(result.amount)}).`);
      }
      return;
    }

    // 2. Odrzucenie pojedynku
    if (action === 'dec' || action === 'decline') {
      const targetId = message.author.id;
      const request = client.duelRequests.get(targetId);

      if (!request) {
        await message.reply('❌ Nie masz żadnego aktywnego wyzwania na pojedynek.');
        return;
      }

      client.duelRequests.delete(targetId);
      saveGameSessions(client);
      const challengerName = await resolveName(client, request.challengerId);
      await message.reply(`⚔️ Odrzucono pojedynek od **${challengerName}**.`);
      return;
    }

    // 3. Wyzywanie na pojedynek
    // Format: !duel <kwota> @osoba
    const rawAmount = args[0];
    let targetId = null;
    let targetName = 'Cel';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || await resolveName(client, targetId);
    } else if (args[1] && /^\d+$/.test(args[1])) {
      targetId = args[1];
      targetName = await resolveName(client, targetId);
    }

    if (!targetId || !rawAmount) {
      await message.reply('❌ Użyj: **!duel <kwota> @osoba** lub **!duel acc** / **!duel dec**.');
      return;
    }

    if (targetId === message.author.id) {
      await message.reply('❌ Nie możesz wyzwać samego siebie na pojedynek.');
      return;
    }

    const validation = await withData(store => {
      if (store.profiles.blacklist && (store.profiles.blacklist.includes(targetId) || store.profiles.blacklist.includes(message.author.id))) {
        return { error: '❌ Jeden z graczy jest zablokowany i nie można wyzwać go na pojedynek.' };
      }

      const challenger = createUser(message.author.id, store.users);
      const target = createUser(targetId, store.users);

      const isAll = ['all', 'max'].includes(String(rawAmount).toLowerCase());
      let amount = 0;
      if (isAll) {
        amount = challenger.balance;
      } else {
        amount = resolveAmount(rawAmount, challenger.balance);
      }

      if (!amount || amount <= 0) {
        return { error: '❌ Podaj poprawną kwotę pojedynku.' };
      }

      if (challenger.balance < amount) {
        return { error: `❌ Nie masz tylu monet w portfelu. Posiadasz: ${formatCurrency(challenger.balance)}` };
      }

      if (target.balance < amount) {
        return { error: `❌ Przeciwnik nie ma tylu monet w portfelu. Wymagane: ${formatCurrency(amount)}` };
      }

      return { success: true, amount };
    });

    if (validation.error) {
      await message.reply(validation.error);
      return;
    }

    if (hasActiveGameSession(client, message.author.id)) {
      await message.reply('❌ Masz już aktywną inną grę! Zakończ ją przed rozpoczęciem pojedynku.');
      return;
    }

    client.duelRequests.set(targetId, {
      challengerId: message.author.id,
      amount: validation.amount,
      timestamp: Date.now()
    });
    saveGameSessions(client);

    // Auto-kasowanie pojedynku po 2 minutach
    setTimeout(() => {
      const active = client.duelRequests.get(targetId);
      if (active && active.challengerId === message.author.id) {
        client.duelRequests.delete(targetId);
        saveGameSessions(client);
      }
    }, 120000).unref();

    const challengerName = await resolveName(client, message.author.id);
    await message.reply(`⚔️ Pojedynek! **${challengerName}** wyzywa **${targetName}** na pojedynek o **${formatCurrency(validation.amount)}**! Wpisz **!duel acc** lub **!duel dec** w ciągu 2 minut.`);
  }
};
