const { formatCurrency, refreshBadges, ensureInventoryRecord, recordGame } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const config = require('../config/config');

module.exports = {
  name: 'rosyjska',
  aliases: ['rr', 'ruletkarosyjska'],
  async execute(client, message, args) {
    if (!client.rrRequests) {
      client.rrRequests = new Map();
    }

    const action = String(args[0] || '').toLowerCase();

    // 1. AKCEPTACJA POJEDYNKU
    if (action === 'acc' || action === 'accept') {
      const targetId = message.author.id;
      const request = client.rrRequests.get(targetId);

      if (!request) {
        await message.reply('❌ Nie masz żadnego aktywnego wyzwania na rosyjską ruletkę.');
        return;
      }

      client.rrRequests.delete(targetId);

      const result = await withData(store => {
        if (store.profiles.blacklist && (store.profiles.blacklist.includes(request.challengerId) || store.profiles.blacklist.includes(targetId))) {
          return { error: '❌ Jeden z graczy jest zablokowany i nie można rozegrać pojedynku.' };
        }

        const challenger = createUser(request.challengerId, store.users);
        const target = createUser(targetId, store.users);

        if (challenger.balance < request.amount) {
          return { error: `❌ Wyzywający nie ma już wymaganej kwoty (${formatCurrency(request.amount)}) w portfelu.` };
        }

        if (target.balance < request.amount) {
          return { error: `❌ Nie masz wystarczającej kwoty (${formatCurrency(request.amount)}) w portfelu.` };
        }

        // Symulacja gry
        const bulletIndex = Math.floor(Math.random() * 6); // 0-5
        const turns = [];
        let currentPlayerId = request.challengerId;
        let otherPlayerId = targetId;
        let deadPlayerId = null;

        for (let chamber = 0; chamber < 6; chamber++) {
          const chance = ((1 / (6 - chamber)) * 100).toFixed(1);
          if (chamber === bulletIndex) {
            turns.push({ playerId: currentPlayerId, chamber: chamber + 1, shot: true, chance });
            deadPlayerId = currentPlayerId;
            break;
          } else {
            turns.push({ playerId: currentPlayerId, chamber: chamber + 1, shot: false, chance });
          }
          // Zamiana ról
          const temp = currentPlayerId;
          currentPlayerId = otherPlayerId;
          otherPlayerId = temp;
        }

        const winnerId = deadPlayerId === request.challengerId ? targetId : request.challengerId;
        const loserId = deadPlayerId;

        const winner = store.users[winnerId];
        const loser = store.users[loserId];

        winner.balance += request.amount;
        loser.balance -= request.amount;

        recordGame(winner, request.amount);
        recordGame(loser, -request.amount);

        refreshBadges(winner, ensureInventoryRecord(store.inventory, winnerId));
        refreshBadges(loser, ensureInventoryRecord(store.inventory, loserId));

        return {
          success: true,
          turns,
          winnerId,
          loserId,
          amount: request.amount
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const challengerName = client.userNames.get(request.challengerId) || `Użytkownik_${request.challengerId.slice(-6)}`;
      const targetName = message.author.username || `Użytkownik_${targetId.slice(-6)}`;

      const sleep = ms => new Promise(res => setTimeout(res, ms));

      await message.reply(`🔫 **Rosyjska Ruletka**: **${challengerName}** vs **${targetName}** o **${formatCurrency(result.amount)}**!\n*Krupier kręci bębenkiem...*`);

      for (const turn of result.turns) {
        await sleep(1000);
        const pName = turn.playerId === request.challengerId ? challengerName : targetName;
        if (turn.shot) {
          await message.reply(`🤠 **Runda ${turn.chamber}** (${turn.chance}%): **${pName}** pociąga za spust... 💥 **STRZAŁ!**`);
        } else {
          await message.reply(`🤠 **Runda ${turn.chamber}** (${turn.chance}%): **${pName}** pociąga za spust... *klik!* (pusto)`);
        }
      }

      await sleep(1000);
      const winnerName = result.winnerId === request.challengerId ? challengerName : targetName;
      const loserName = result.loserId === request.challengerId ? challengerName : targetName;

      await message.reply(`🏆 **${winnerName}** wygrywa **+${formatCurrency(result.amount)}**! 💀 **${loserName}** ginie.`);
      return;
    }

    // 2. ODRZUCENIE POJEDYNKU
    if (action === 'dec' || action === 'decline') {
      const targetId = message.author.id;
      const request = client.rrRequests.get(targetId);

      if (!request) {
        await message.reply('❌ Nie masz żadnego aktywnego wyzwania na rosyjską ruletkę.');
        return;
      }

      client.rrRequests.delete(targetId);
      const challengerName = client.userNames.get(request.challengerId) || `Użytkownik_${request.challengerId.slice(-6)}`;
      await message.reply(`🔫 Wyzwanie na rosyjską ruletkę od **${challengerName}** zostało odrzucone.`);
      return;
    }

    // 3. SOLO LUB WYZWANIE
    const rawAmount = args[0];
    if (!rawAmount) {
      await message.reply('❌ Użyj:\n• Solo: `!rr <kwota>`\n• Wyzwanie: `!rr <kwota> @osoba`\n• Akceptacja/Odrzucenie: `!rr acc` / `!rr dec`');
      return;
    }

    let targetId = null;
    let targetName = '';

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

    // A. TRYB SOLO
    if (!targetId) {
      const result = await withData(store => {
        if (store.profiles.blacklist && store.profiles.blacklist.includes(message.author.id)) {
          return { error: '❌ Jesteś na czarnej liście.' };
        }

        const user = createUser(message.author.id, store.users);
        const isAll = ['all', 'max'].includes(String(rawAmount).toLowerCase());
        const amount = isAll ? user.balance : Math.floor(Number(rawAmount));

        if (isNaN(amount) || amount <= 0) {
          return { error: '❌ Podaj poprawną kwotę stawki.' };
        }

        if (user.balance < amount) {
          return { error: `❌ Nie masz tylu monet w portfelu. Posiadasz: ${formatCurrency(user.balance)}` };
        }

        // Rosyjska ruletka: 2/6 szansy na porażkę
        const isDead = Math.random() < (2 / 6);

        if (isDead) {
          user.balance -= amount;
        } else {
          // Payout 1.333x (zysk 33.3% stawki)
          user.balance += Math.floor(amount * 0.333);
        }

        const net = isDead ? -amount : Math.floor(amount * 0.333);
        recordGame(user, net);

        refreshBadges(user, ensureInventoryRecord(store.inventory, message.author.id));

        return {
          success: true,
          isDead,
          amount,
          newBalance: user.balance
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      let response = `🔫 **ROSYJSKA RULETKA (Solo)** 🔫\n`;
      response += `*Wkładasz 2 naboje do rewolweru, kręcisz bębenkiem, przykładasz lufę do skroni...*\n\n`;

      if (result.isDead) {
        response += `💥 **STRZAŁ!** Rewolwer wystrzelił!\n`;
        response += `💀 Ginisz na miejscu i tracisz stawkę: **-${formatCurrency(result.amount)}**.\n`;
        response += `💰 Twój portfel: **${formatCurrency(result.newBalance)}**`;
      } else {
        response += `*...klik!* (Pusto. Słychać tylko suche kliknięcie iglicy)\n`;
        response += `🏆 Udało Ci się przeżyć! Wygrywasz **+${formatCurrency(Math.floor(result.amount * 0.333))}** (zysk 33.3%).\n`;
        response += `💰 Twój portfel: **${formatCurrency(result.newBalance)}**`;
      }

      await message.reply(response);
      return;
    }

    // B. TRYB WYZWANIA (POJEDYNEK)
    if (targetId === message.author.id) {
      await message.reply('❌ Nie możesz wyzwać samego siebie.');
      return;
    }

    const validation = await withData(store => {
      if (store.profiles.blacklist && (store.profiles.blacklist.includes(targetId) || store.profiles.blacklist.includes(message.author.id))) {
        return { error: '❌ Jeden z graczy jest zablokowany.' };
      }

      const challenger = createUser(message.author.id, store.users);
      const target = createUser(targetId, store.users);

      const isAll = ['all', 'max'].includes(String(rawAmount).toLowerCase());
      const amount = isAll ? challenger.balance : Math.floor(Number(rawAmount));

      if (isNaN(amount) || amount <= 0) {
        return { error: '❌ Podaj poprawną kwotę stawki.' };
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

    client.rrRequests.set(targetId, {
      challengerId: message.author.id,
      amount: validation.amount
    });

    // Auto-kasowanie wyzwania po 2 minutach
    setTimeout(() => {
      const active = client.rrRequests.get(targetId);
      if (active && active.challengerId === message.author.id) {
        client.rrRequests.delete(targetId);
      }
    }, 120000).unref();

    const challengerName = message.author.username || `Użytkownik_${message.author.id.slice(-6)}`;
    await message.reply(`🔫 Pojedynek Ruletki! **${challengerName}** wyzywa **${targetName}** na rosyjską ruletkę o **${formatCurrency(validation.amount)}**! Wpisz \`!rr acc\` lub \`!rr dec\` w ciągu 2 minut.`);
  }
};
