const { formatCurrency, refreshBadges, ensureInventoryRecord,   recordGame,
  getRandomXp
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const config = require('../config/config');
const { getEffectiveChance } = require('../utils/chances');

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

      const rrDuelOverride = await getEffectiveChance(request.challengerId, 'rr_duel_bullet');

      const result = await withData(store => {
        if (store.profiles.blacklist && (store.profiles.blacklist.includes(request.challengerId) || store.profiles.blacklist.includes(targetId))) {
          return { error: '❌ Jeden z graczy jest na czarnej liście.' };
        }

        const challenger = createUser(request.challengerId, store.users);
        const target = createUser(targetId, store.users);

        if (challenger.balance < request.amount) {
          return { error: '❌ Wyzywający nie ma już wymaganej kwoty.' };
        }

        if (target.balance < request.amount) {
          return { error: '❌ Nie masz wystarczającej kwoty w portfelu.' };
        }

        // Symulacja gry
        const bulletChance = Number.isFinite(rrDuelOverride) ? rrDuelOverride / 100 : (1 / 6);
        const bulletIndex = Math.random() < bulletChance ? 0 : (1 + Math.floor(Math.random() * 5));
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

        const tax = Math.floor(request.amount * 0.05);
        let winAmount = request.amount - tax;
        if (winner.badges && winner.badges.includes(config.badges.uzalezniony)) {
          winAmount = Math.round(winAmount * 1.03);
        }
        winner.balance += winAmount;
        loser.balance -= request.amount;

        const winnerInv = ensureInventoryRecord(store.inventory, winnerId);
        const loserInv = ensureInventoryRecord(store.inventory, loserId);

        const winnerXpResult = recordGame(winner, winAmount, getRandomXp(), winnerInv);
        const loserXpResult = recordGame(loser, -request.amount, getRandomXp(), loserInv);

        refreshBadges(winner, winnerInv);
        refreshBadges(loser, loserInv);

        return {
          success: true,
          turns,
          winnerId,
          loserId,
          amount: request.amount,
          winAmount,
          tax,
          winnerXpResult,
          loserXpResult
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

      await message.reply(`🏆 **${winnerName}** wygrywa **+${formatCurrency(result.winAmount)}** (po potrąceniu 5% podatku: -${formatCurrency(result.tax)})! 💀 **${loserName}** ginie.`);

      let lvlUpMessage = '';
      if (result.winnerXpResult && result.winnerXpResult.leveledUp) {
        lvlUpMessage += `\n🎉 **${winnerName}** awansował na **poziom ${result.winnerXpResult.newLevel}**!`;
        if (result.winnerXpResult.milestonesGained && result.winnerXpResult.milestonesGained.length > 0) {
          const { getMilestoneRewardDescription } = require('../utils/economy');
          for (const lvl of result.winnerXpResult.milestonesGained) {
            lvlUpMessage += `\n🎁 Otrzymał nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
          }
        }
      }
      if (result.loserXpResult && result.loserXpResult.leveledUp) {
        lvlUpMessage += `\n🎉 **${loserName}** awansował na **poziom ${result.loserXpResult.newLevel}**!`;
        if (result.loserXpResult.milestonesGained && result.loserXpResult.milestonesGained.length > 0) {
          const { getMilestoneRewardDescription } = require('../utils/economy');
          for (const lvl of result.loserXpResult.milestonesGained) {
            lvlUpMessage += `\n🎁 Otrzymał nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
          }
        }
      }
      if (lvlUpMessage) {
        await message.reply(lvlUpMessage);
      }
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
      await message.reply('❌ Użyj:\n• Solo: **!rr <kwota>**\n• Wyzwanie: **!rr <kwota> @osoba**\n• Akceptacja/Odrzucenie: **!rr acc** / **!rr dec**');
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
      const rrSoloOverride = await getEffectiveChance(message.author.id, 'rr_solo_survive');

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

        const survivePercent = Number.isFinite(rrSoloOverride) ? rrSoloOverride : (4 / 6) * 100;
        const isDead = Math.random() >= (survivePercent / 100);

        let net = 0;
        if (isDead) {
          user.balance -= amount;
          net = -amount;
        } else {
          let win = Math.floor(amount * 0.333);
          if (user.badges && user.badges.includes(config.badges.uzalezniony)) {
            win = Math.round(win * 1.03);
          }
          const { hasItem } = require('../utils/economy');
          if (hasItem(ensureInventoryRecord(store.inventory, message.author.id), 'krolewskie_insygnia')) {
            win = Math.floor(win * 1.10);
          }
          user.balance += win;
          net = win;
        }

        const xpResult = recordGame(user, net, getRandomXp(), ensureInventoryRecord(store.inventory, message.author.id));
        refreshBadges(user, ensureInventoryRecord(store.inventory, message.author.id));

        return {
          success: true,
          isDead,
          amount,
          newBalance: user.balance,
          xpResult,
          net
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
        response += `🏆 Udało Ci się przeżyć! Wygrywasz **+${formatCurrency(result.net)}**.\n`;
        response += `💰 Twój portfel: **${formatCurrency(result.newBalance)}**`;
      }

      if (result.xpResult && result.xpResult.leveledUp) {
        response += `\n\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
        if (result.xpResult.milestonesGained && result.xpResult.milestonesGained.length > 0) {
          const { getMilestoneRewardDescription } = require('../utils/economy');
          for (const lvl of result.xpResult.milestonesGained) {
            response += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
          }
        }
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
    await message.reply(`🔫 Pojedynek Ruletki! **${challengerName}** wyzywa **${targetName}** na rosyjską ruletkę o **${formatCurrency(validation.amount)}**! Wpisz **!rr acc** lub **!rr dec** w ciągu 2 minut.`);
  }
};
