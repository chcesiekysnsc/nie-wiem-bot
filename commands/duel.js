const { formatCurrency, refreshBadges, ensureInventoryRecord } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

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

        if (challengerWins) {
          challenger.balance += request.amount;
          target.balance -= request.amount;
        } else {
          challenger.balance -= request.amount;
          target.balance += request.amount;
        }

        refreshBadges(challenger, ensureInventoryRecord(store.inventory, request.challengerId));
        refreshBadges(target, ensureInventoryRecord(store.inventory, targetId));

        return {
          success: true,
          challengerWins,
          amount: request.amount
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const challengerName = client.userNames.get(request.challengerId) || `Użytkownik_${request.challengerId.slice(-6)}`;
      const targetName = message.author.username || `Użytkownik_${targetId.slice(-6)}`;

      if (result.challengerWins) {
        await message.reply(`⚔️ Pojedynek rozstrzygnięty! Wygrywa **${challengerName}** (+${formatCurrency(result.amount)}), przegrywa **${targetName}** (-${formatCurrency(result.amount)}).`);
      } else {
        await message.reply(`⚔️ Pojedynek rozstrzygnięty! Wygrywa **${targetName}** (+${formatCurrency(result.amount)}), przegrywa **${challengerName}** (-${formatCurrency(result.amount)}).`);
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
      const challengerName = client.userNames.get(request.challengerId) || `Użytkownik_${request.challengerId.slice(-6)}`;
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
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[1] && /^\d+$/.test(args[1])) {
      targetId = args[1];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    if (!targetId || !rawAmount) {
      await message.reply('❌ Użyj: `!duel <kwota> @osoba` lub `!duel acc` / `!duel dec`.');
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
      let amount = isAll ? challenger.balance : Math.floor(Number(rawAmount));

      if (isNaN(amount) || amount <= 0) {
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

    client.duelRequests.set(targetId, {
      challengerId: message.author.id,
      amount: validation.amount
    });

    // Auto-kasowanie pojedynku po 2 minutach
    setTimeout(() => {
      const active = client.duelRequests.get(targetId);
      if (active && active.challengerId === message.author.id) {
        client.duelRequests.delete(targetId);
      }
    }, 120000).unref();

    const challengerName = message.author.username || `Użytkownik_${message.author.id.slice(-6)}`;
    await message.reply(`⚔️ Pojedynek! **${challengerName}** wyzywa **${targetName}** na pojedynek o **${formatCurrency(validation.amount)}**! Wpisz \`!duel acc\` lub \`!duel dec\` w ciągu 2 minut.`);
  }
};
