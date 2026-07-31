const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, hasItem, getPassiveMultiplier,   getDealerBonusChance,
  getRandomXp
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

async function resolveName(client, userId) {
  if (typeof client.resolveUserName === 'function') {
    return await client.resolveUserName(userId);
  }
  return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
}

const MOVES = {
  kamien: { name: 'Kamień', emoji: '🪨', beats: 'nozyce' },
  papier: { name: 'Papier', emoji: '📄', beats: 'kamien' },
  nozyce: { name: 'Nożyce', emoji: '✂️', beats: 'papier' },
  k: { name: 'Kamień', emoji: '🪨', beats: 'nozyce', canonical: 'kamien' },
  p: { name: 'Papier', emoji: '📄', beats: 'kamien', canonical: 'papier' },
  n: { name: 'Nożyce', emoji: '✂️', beats: 'papier', canonical: 'nozyce' }
};

function getCanonicalMove(input) {
  const normalized = String(input || '').toLowerCase().trim()
    .replace(/ą/g, 'a').replace(/ę/g, 'e').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ł/g, 'l').replace(/ż/g, 'z')
    .replace(/ź/g, 'z').replace(/ć/g, 'c').replace(/ń/g, 'n');
  
  if (MOVES[normalized]) {
    return MOVES[normalized].canonical || normalized;
  }
  return null;
}

module.exports = {
  name: 'pkn',
  aliases: ['rps', 'papierkamiennozyce'],
  async execute(client, message, args) {
    if (!client.pknRequests) {
      client.pknRequests = new Map();
    }

    const firstArg = String(args[0] || '').toLowerCase().trim();

    // 1. Akceptacja pojedynku
    if (firstArg === 'acc' || firstArg === 'accept') {
      const targetId = message.author.id;
      const request = client.pknRequests.get(targetId);

      if (!request) {
        await message.reply('❌ Nie masz żadnego aktywnego wyzwania na pojedynek PKN.');
        return;
      }

      client.pknRequests.delete(targetId);

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

        // Losowanie ruchów
        const choices = ['kamien', 'papier', 'nozyce'];
        const challengerMove = choices[Math.floor(Math.random() * choices.length)];
        const targetMove = choices[Math.floor(Math.random() * choices.length)];

        let winner = null; // 'challenger', 'target' lub null (remis)

        if (challengerMove !== targetMove) {
          if (MOVES[challengerMove].beats === targetMove) {
            winner = 'challenger';
          } else {
            winner = 'target';
          }
        }

        const tax = Math.floor(request.amount * 0.05);
        const netWin = request.amount - tax;

        if (winner === 'challenger') {
          challenger.balance += netWin;
          target.balance -= request.amount;
        } else if (winner === 'target') {
          challenger.balance -= request.amount;
          target.balance += netWin;
        }

        refreshBadges(challenger, ensureInventoryRecord(store.inventory, request.challengerId));
        refreshBadges(target, ensureInventoryRecord(store.inventory, targetId));

        return {
          success: true,
          winner,
          challengerMove,
          targetMove,
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

      const challengerMoveDetails = MOVES[result.challengerMove];
      const targetMoveDetails = MOVES[result.targetMove];

      let response = `⚔️ **Pojedynek PKN: ${challengerName} vs ${targetName}** ⚔️\n\n` +
                     `👤 **${challengerName}** pokazuje: ${challengerMoveDetails.emoji} **${challengerMoveDetails.name}**\n` +
                     `👤 **${targetName}** pokazuje: ${targetMoveDetails.emoji} **${targetMoveDetails.name}**\n\n`;

      if (result.winner === 'challenger') {
        response += `🎉 Wygrywa **${challengerName}** (+${formatCurrency(result.netWin)} po potrąceniu 5% podatku)!\n` +
                    `💀 **${targetName}** traci ${formatCurrency(result.amount)}.`;
      } else if (result.winner === 'target') {
        response += `🎉 Wygrywa **${targetName}** (+${formatCurrency(result.netWin)} po potrąceniu 5% podatku)!\n` +
                    `💀 **${challengerName}** traci ${formatCurrency(result.amount)}.`;
      } else {
        response += `🤝 **REMIS!** Obaj gracze wybrali to samo. Monety wracają do portfeli.`;
      }

      await message.reply(response);
      return;
    }

    // 2. Odrzucenie pojedynku
    if (firstArg === 'dec' || firstArg === 'decline') {
      const targetId = message.author.id;
      const request = client.pknRequests.get(targetId);

      if (!request) {
        await message.reply('❌ Nie masz żadnego aktywnego wyzwania na pojedynek PKN.');
        return;
      }

      client.pknRequests.delete(targetId);
      const challengerName = await resolveName(client, request.challengerId);
      await message.reply(`⚔️ Odrzucono pojedynek PKN od **${challengerName}**.`);
      return;
    }

    // 3. Parsowanie argumentów komendy (Singleplayer vs PvP)
    const arg0 = args[0] || '';
    const arg1 = args[1] || '';

    const move0 = getCanonicalMove(arg0);
    const move1 = getCanonicalMove(arg1);

    let isSingleplayer = false;
    let playerMove = null;
    let rawBet = null;

    if (move0 && !move1) {
      playerMove = move0;
      rawBet = arg1;
      isSingleplayer = true;
    } else if (move1 && !move0) {
      playerMove = move1;
      rawBet = arg0;
      isSingleplayer = true;
    }

    // A. Bieg gry jednoosobowej (Singleplayer)
    if (isSingleplayer) {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        const inventory = ensureInventoryRecord(store.inventory, message.author.id);
        const bet = resolveAmount(rawBet, user.balance);

        if (!bet || bet <= 0) {
          return { error: '❌ Podaj poprawną kwotę zakładu.' };
        }

        if (bet > user.balance) {
          return { error: `❌ Nie masz tylu monet. Posiadasz: ${formatCurrency(user.balance)}` };
        }

        // Bonusy win chance
        let badgeBonus = 0;
        let activeBadgeName = '';
        if (user.badges) {
          if (user.badges.includes(config.badges.bog)) {
            badgeBonus = 1.5;
            activeBadgeName = config.badges.bog;
          } else if (user.badges.includes(config.badges.rekin)) {
            badgeBonus = 1.0;
            activeBadgeName = config.badges.rekin;
          } else if (user.badges.includes(config.badges.hazardzista)) {
            badgeBonus = 0.5;
            activeBadgeName = config.badges.hazardzista;
          }
        }
        const hasOko = hasItem(inventory, 'szkarlatne_oko');
        const okoBonus = hasOko ? 1.5 : 0;
        
        const ananasMultiplier = getPassiveMultiplier(inventory, 'ananas_na_pizzy', 0.02);
        const ananasBonus = ananasMultiplier * 100;
        
        const totalRescueBonus = badgeBonus + okoBonus + ananasBonus;

        // Losowanie bota
        const choices = ['kamien', 'papier', 'nozyce'];
        let botMove = choices[Math.floor(Math.random() * choices.length)];

        let state = 'draw'; // 'win', 'lose', 'draw'
        if (playerMove !== botMove) {
          if (MOVES[playerMove].beats === botMove) {
            state = 'win';
          } else {
            state = 'lose';
          }
        }

        // Przedmioty / odznaczenia ratujące
        let krupierSaved = false;
        let badgeSaved = false;
        let okoSaved = false;

        if (state === 'lose') {
          const dealerCheatChance = getDealerBonusChance(inventory);
          if (dealerCheatChance > 0 && Math.random() < dealerCheatChance) {
            botMove = MOVES[playerMove].beats;
            state = 'win';
            krupierSaved = true;
          }
        }

        let ananasSaved = false;
        if (state === 'lose' && totalRescueBonus > 0) {
          const rollRescue = Math.random() * 100;
          if (rollRescue < totalRescueBonus) {
            state = 'draw';
            botMove = playerMove;
            if (rollRescue < badgeBonus) {
              badgeSaved = true;
            } else if (rollRescue < badgeBonus + okoBonus) {
              okoSaved = true;
            } else {
              ananasSaved = true;
            }
          }
        }

        let net = 0;
        if (state === 'win') {
          net = Math.round(bet * 0.90);
          if (hasItem(inventory, 'krolewskie_insygnia')) {
            net = Math.floor(net * 1.10);
          }
          user.balance += net;
        } else if (state === 'lose') {
          net = -bet;
          user.balance -= bet;
        }

        const { recordGame } = require('../utils/economy');
        const xpResult = recordGame(user, net, getRandomXp(), inventory);
        refreshBadges(user, inventory);

        return {
          state,
          botMove,
          playerMove,
          net,
          balance: user.balance,
          krupierSaved,
          badgeSaved,
          okoSaved,
          ananasSaved,
          activeBadgeName,
          xpResult
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const playerMoveDetails = MOVES[result.playerMove];
      const botMoveDetails = MOVES[result.botMove];

      let replyText = `✊ **P-K-N (Gra z Botem)** 🖐️\n` +
                      `👤 Twój ruch: ${playerMoveDetails.emoji} **${playerMoveDetails.name}**\n` +
                      `🤖 Mój ruch: ${botMoveDetails.emoji} **${botMoveDetails.name}**\n\n`;

      if (result.state === 'win') {
        replyText += `🎉 Wygrana! Twój zysk netto: **+${formatCurrency(result.net)}**\n`;
      } else if (result.state === 'lose') {
        replyText += `💀 Przegrana! Strata: **-${formatCurrency(Math.abs(result.net))}**\n`;
      } else {
        replyText += `🤝 Remis! Twoja stawka została zwrócona.\n`;
      }

      replyText += `💰 Twój balans: **${formatCurrency(result.balance)}**`;

      if (result.krupierSaved) {
        replyText += `\n🧠 **Przekupiony Krupier**: Krupier po kryjomu zmienił swój ruch, pozwalając Ci wygrać!`;
      }
      if (result.badgeSaved && result.activeBadgeName) {
        replyText += `\n🍀 Odznaka **${result.activeBadgeName}** uratowała Cię przed przegraną (zmieniono na remis)!`;
      }
      if (result.okoSaved) {
        replyText += `\n👁️ Przedmiot **Szkarłatne Oko Krupiera** uratował Cię przed przegraną (zmieniono na remis)!`;
      }
      if (result.ananasSaved) {
        replyText += `\n🍕 Przedmiot **Ananas na Pizzy** uratował Cię przed przegraną (zmieniono na remis)!`;
      }

      if (result.xpResult && result.xpResult.leveledUp) {
        replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
        if (result.xpResult.milestonesGained && result.xpResult.milestonesGained.length > 0) {
          const { getMilestoneRewardDescription } = require('../utils/economy');
          for (const lvl of result.xpResult.milestonesGained) {
            replyText += `\n🎁 Otrzymałeś nagrodę za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
          }
        }
      }

      await message.reply(replyText);
      return;
    }

    // B. Bieg gry PvP (Pojedynek)
    let targetId = null;
    let targetName = '';
    let rawAmount = null;

    const mentioned = message.mentions.users.first();
    const isArg0Id = /^\d{10,18}$/.test(arg0);
    const isArg1Id = /^\d{10,18}$/.test(arg1);

    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || await resolveName(client, targetId);
      // Odszukaj kwotę w drugim argumencie
      const mentionArgIndex = args.findIndex(arg => arg.includes(mentioned.id) || arg.startsWith('@'));
      rawAmount = (mentionArgIndex === 0) ? args[1] : args[0];
    } else if (isArg0Id && !isArg1Id) {
      targetId = arg0;
      targetName = await resolveName(client, targetId);
      rawAmount = arg1;
    } else if (isArg1Id && !isArg0Id) {
      targetId = arg1;
      targetName = await resolveName(client, targetId);
      rawAmount = arg0;
    }

    if (targetId && rawAmount) {
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

      client.pknRequests.set(targetId, {
        challengerId: message.author.id,
        amount: validation.amount
      });

      setTimeout(() => {
        const active = client.pknRequests.get(targetId);
        if (active && active.challengerId === message.author.id) {
          client.pknRequests.delete(targetId);
        }
      }, 120000).unref();

      const challengerName = await resolveName(client, message.author.id);
      await message.reply(`⚔️ **Pojedynek PKN!** **${challengerName}** wyzywa **${targetName}** o **${formatCurrency(validation.amount)}**!\n` +
                          `👉 Wpisz **!pkn acc** (akceptuj) lub **!pkn dec** (odrzuć) w ciągu 2 minut.`);
      return;
    }

    // C. Błąd składni
    await message.reply('❌ Niepoprawne użycie komendy.\n' +
                        '👉 **Graj z botem**: `!pkn <stawka> <k/p/n>` (np. `!pkn 1000 k` lub `!pkn k 1000`)\n' +
                        '👉 **Graj z kimś**: `!pkn @osoba <stawka>` (np. `!pkn @Marek 5000` lub `!pkn 5000 @Marek`)');
  }
};
