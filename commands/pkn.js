const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount, hasItem } = require('../utils/economy');
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

    // 3. Wyzywanie na pojedynek (lub gra z botem)
    // Sprawdzamy czy pierwszy argument to kwota, a drugi to ruch (gra z botem)
    // Format: !pkn <stawka> <ruch> (gra z botem)
    // Format: !pkn @osoba/id <stawka> (pojedynkowanie)
    
    let isPvP = false;
    let targetId = null;
    let targetName = '';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || await resolveName(client, targetId);
      isPvP = true;
    } else if (/^\d{10,18}$/.test(firstArg)) {
      targetId = firstArg;
      targetName = await resolveName(client, targetId);
      isPvP = true;
    }

    if (isPvP) {
      // PvP flow: !pkn @osoba <stawka>
      const rawAmount = args[1];
      if (!rawAmount) {
        await message.reply('❌ Użyj: **!pkn @osoba <kwota>**');
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

      client.pknRequests.set(targetId, {
        challengerId: message.author.id,
        amount: validation.amount
      });

      // Auto-cancel request after 2 minutes
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

    // Singleplayer flow: !pkn <stawka> <ruch>
    const rawBet = args[0];
    const rawMove = args[1];

    const playerMove = getCanonicalMove(rawMove);
    if (!playerMove) {
      await message.reply('❌ Wybierz ruch: **papier** (p), **kamien** (k) lub **nozyce** (n).\nUżycie: **!pkn <stawka> <ruch>** (np. **!pkn 1000 k**).');
      return;
    }

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
      const totalRescueBonus = badgeBonus + okoBonus;

      // Losowanie ruchu bota
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

      // Cheaty / Przedmioty ratujące
      let krupierSaved = false;
      let badgeSaved = false;
      let okoSaved = false;

      if (state === 'lose') {
        // 1. Przekupiony Krupier (3% szans na wygraną przy przegranej)
        const hasKrupier = hasItem(inventory, 'przekupiony_krupier');
        if (hasKrupier && Math.random() < 0.03) {
          // Zmiana ruchu bota na taki, by gracz wygrał
          botMove = MOVES[playerMove].beats;
          state = 'win';
          krupierSaved = true;
        }
      }

      if (state === 'lose' && totalRescueBonus > 0) {
        // Ocalenie odznakami/okiem (zamiana przegranej na remis)
        const rollRescue = Math.random() * 100;
        if (rollRescue < totalRescueBonus) {
          state = 'draw';
          botMove = playerMove; // Zmiana na remis
          if (rollRescue < badgeBonus) {
            badgeSaved = true;
          } else {
            okoSaved = true;
          }
        }
      }

      let net = 0;
      if (state === 'win') {
        net = Math.round(bet * 0.90); // Zysk netto 90% stawki
        user.balance += net;
      } else if (state === 'lose') {
        net = -bet;
        user.balance -= bet;
      }

      const { recordGame } = require('../utils/economy');
      const xpResult = recordGame(user, net, 25, inventory);
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
  }
};
