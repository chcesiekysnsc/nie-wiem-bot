const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  formatNumber,
  hasItem,
  recordGame,
  refreshBadges,
  resolveAmount,
  getPassiveMultiplier,
  getActiveEventMultiplier
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function getColor(number) {
  if (number === 0) return 'green';
  return RED_NUMBERS.has(number) ? 'red' : 'black';
}

function parseBetTarget(input) {
  const value = String(input || '').toLowerCase();
  if (['red', 'r', 'czerwony'].includes(value)) return { type: 'color', value: 'red', label: 'Czerwony' };
  if (['black', 'b', 'czarny'].includes(value)) return { type: 'color', value: 'black', label: 'Czarny' };
  if (['green', 'g', 'zielony'].includes(value)) return { type: 'color', value: 'green', label: 'Zielony' };
  if (['even', 'parzyste'].includes(value)) return { type: 'parity', value: 'even', label: 'Parzyste' };
  if (['odd', 'nieparzyste'].includes(value)) return { type: 'parity', value: 'odd', label: 'Nieparzyste' };

  const number = Number(value);
  if (Number.isInteger(number) && number >= 0 && number <= 36) {
    return { type: 'number', value: number, label: `Numer ${number}` };
  }
  return null;
}

module.exports = {
  name: 'ruletka',
  aliases: ['roulette', 'roul'],
  async execute(client, message, args) {
    const target = parseBetTarget(args[1]);

    if (!target) {
      await message.reply('❌ Użyj: **!ruletka <kwota> <czerwony/czarny/zielony/parzyste/nieparzyste/0-36>**');
      return;
    }

    const threadId = message.guild?.id || message.rawEvent?.threadID;
    const isMultiActive = client.activeMultiRoulettes && client.activeMultiRoulettes.has(threadId);

    if (isMultiActive) {
      const game = client.activeMultiRoulettes.get(threadId);
      
      const alreadyBet = game.bets.some(b => b.userId === message.author.id);
      if (alreadyBet) {
        await message.reply('❌ Postawiłeś już zakład w tej rundzie ruletki wieloosobowej!');
        return;
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        const bet = resolveAmount(args[0], user.balance);

        if (!bet || bet <= 0) return { error: '❌ Podaj poprawną kwotę betu.' };
        if (bet > user.balance) return { error: `❌ Brak wystarczających środków w portfelu. Posiadasz: ${formatCurrency(user.balance)}` };

        user.balance -= bet;
        return { success: true, bet };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const userName = message.author.username || message.author.profile?.name || `Gracz_${message.author.id.slice(-6)}`;
      game.bets.push({
        userId: message.author.id,
        userName,
        betAmount: result.bet,
        target: target
      });

      await message.reply(`✅ **Obstawiono!** @${userName} postawił **${formatCurrency(result.bet)}** na **${target.label}**.`);
      return;
    }

    const rouletteLuckOverride = await getEffectiveChance(message.author.id, 'roulette_win_luck');

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bet = resolveAmount(args[0], user.balance);

      if (!bet) return { error: '❌ Podaj poprawną kwotę betu.' };
      if (bet > user.balance) return { error: '❌ Brak wystarczających środków w portfelu.' };

      user.balance -= bet;

      const rand = Math.random();
      let rolledColor;
      let rolledNumber;

      if (rand < 0.01) {
        rolledColor = 'green';
        rolledNumber = 0;
      } else if (rand < 0.505) {
        rolledColor = 'red';
        const reds = Array.from(RED_NUMBERS);
        rolledNumber = reds[Math.floor(Math.random() * reds.length)];
      } else {
        rolledColor = 'black';
        const blacks = [];
        for (let i = 1; i <= 36; i++) {
          if (!RED_NUMBERS.has(i)) {
            blacks.push(i);
          }
        }
        rolledNumber = blacks[Math.floor(Math.random() * blacks.length)];
      }

      let won = false;
      let multiplier = 0;

      if (target.type === 'color') {
        won = rolledColor === target.value;
        multiplier = target.value === 'green' ? 36 : 2;
      } else if (target.type === 'parity') {
        won = rolledNumber !== 0 && ((rolledNumber % 2 === 0 && target.value === 'even') || (rolledNumber % 2 === 1 && target.value === 'odd'));
        multiplier = 2;
      } else if (target.type === 'number') {
        won = rolledNumber === target.value;
        multiplier = rolledNumber === 0 ? 18 : 12;
      }

      let badgeSaved = false;
      let szkarlatneOkoSaved = false;
      let ananasSaved = false;
      let kosciRefunded = false;
      let activeBadgeName = '';
      let dealerCheated = false;

      const hasDealerItem = hasItem(inventory, 'przekupiony_krupier');
      if (!won && hasDealerItem && Math.random() < 0.03) {
        won = true;
        dealerCheated = true;
        
        if (target.type === 'color') {
          rolledColor = target.value;
          if (rolledColor === 'red') {
            const reds = Array.from(RED_NUMBERS);
            rolledNumber = reds[Math.floor(Math.random() * reds.length)];
          } else if (rolledColor === 'black') {
            const blacks = [];
            for (let i = 1; i <= 36; i++) {
              if (!RED_NUMBERS.has(i)) blacks.push(i);
            }
            rolledNumber = blacks[Math.floor(Math.random() * blacks.length)];
          } else { // green
            rolledNumber = 0;
          }
          multiplier = target.value === 'green' ? 36 : 2;
        } else if (target.type === 'parity') {
          const matches = [];
          for (let i = 1; i <= 36; i++) {
            if (target.value === 'even' && i % 2 === 0) matches.push(i);
            if (target.value === 'odd' && i % 2 === 1) matches.push(i);
          }
          rolledNumber = matches[Math.floor(Math.random() * matches.length)];
          rolledColor = RED_NUMBERS.has(rolledNumber) ? 'red' : 'black';
          multiplier = 2;
        } else if (target.type === 'number') {
          rolledNumber = target.value;
          rolledColor = rolledNumber === 0 ? 'green' : (RED_NUMBERS.has(rolledNumber) ? 'red' : 'black');
          multiplier = rolledNumber === 0 ? 18 : 12;
        }
      }

      if (!won) {
        let helperChance = 0;
        let badgeChance = 0;
        if (user.badges) {
          if (user.badges.includes(config.badges.bog)) {
            badgeChance = 0.015;
            activeBadgeName = config.badges.bog;
          } else if (user.badges.includes(config.badges.rekin)) {
            badgeChance = 0.01;
            activeBadgeName = config.badges.rekin;
          } else if (user.badges.includes(config.badges.hazardzista)) {
            badgeChance = 0.005;
            activeBadgeName = config.badges.hazardzista;
          }
        }
        helperChance += badgeChance;
        const hasOko = hasItem(inventory, 'szkarlatne_oko');
        if (hasOko) {
          helperChance += 0.015;
        }
        const ananasBonus = getPassiveMultiplier(inventory, 'ananas_na_pizzy', 0.02);
        helperChance += ananasBonus;
        if (Number.isFinite(rouletteLuckOverride) && rouletteLuckOverride > 0) {
          helperChance += rouletteLuckOverride / 100;
        }

        let wasRescued = false;
        if (helperChance > 0) {
          const secondRoll = Math.random();
          if (secondRoll < helperChance) {
            won = true;
            multiplier = target.type === 'color' ? (target.value === 'green' ? 36 : 2) : 2;
            let current = 0;
            if (secondRoll < (current += badgeChance)) {
              badgeSaved = true;
            } else if (hasOko && secondRoll < (current += 0.015)) {
              szkarlatneOkoSaved = true;
            } else if (ananasBonus > 0 && secondRoll < (current += ananasBonus)) {
              ananasSaved = true;
            }
            wasRescued = true;
          }
        }

        if (!wasRescued) {
          const kosciBonusPct = getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02);
          if (kosciBonusPct > 0 && Math.random() < kosciBonusPct) {
            won = true;
            multiplier = 1.0;
            kosciRefunded = true;
          }
        }
      }

      let payout = won ? (kosciRefunded ? bet : bet * multiplier) : 0;
      // Event casino mnożnik
      if (won && !kosciRefunded) {
        const evMul = getActiveEventMultiplier('casino');
        if (evMul > 1) {
          const profit = payout - bet;
          payout = bet + Math.round(profit * evMul);
        }
      }
      if (won && !kosciRefunded && user.badges && user.badges.includes(config.badges.uzalezniony)) {
        const profit = payout - bet;
        if (profit > 0) {
          payout += Math.round(profit * 0.03);
        }
      }
      user.balance += payout;

      const net = payout - bet;
      const xpResult = recordGame(user, net, 25, inventory);
      refreshBadges(user, inventory);

      return {
        won,
        bet,
        payout,
        net,
        rolledNumber,
        rolledColor,
        label: target.label,
        xpResult,
        badgeSaved,
        szkarlatneOkoSaved,
        ananasSaved,
        kosciRefunded,
        activeBadgeName,
        dealerCheated
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const colorLabel = result.rolledColor === 'red' ? 'Czerwone' : result.rolledColor === 'black' ? 'Czarne' : 'Zielone';
    const outcome = `${result.rolledNumber} (${colorLabel})`;
    const winText = result.won ? `Wygrana! +${formatCurrency(result.net)}` : `Przegrana. -${formatCurrency(result.bet)}`;
    let replyText = `🎰 Ruletka: Wypadło **${outcome}**. Typ: **${result.label}**. ${winText}`;

    if (result.dealerCheated) {
      replyText += `\n🧠 **Przekupiony Krupier:** *Krupier dyskretnie popchnął kulkę na pole pasujące do Twojego zakładu (${result.rolledNumber} ${colorLabel})!*`;
    }
    if (result.badgeSaved && result.activeBadgeName) {
      replyText += `\n🍀 Odznaka **${result.activeBadgeName}** dała Ci dodatkową szansę i uratowała przed przegraną!`;
    }
    if (result.szkarlatneOkoSaved) {
      replyText += `\n👁️ Przedmiot **Szkarłatne Oko Krupiera** dał Ci dodatkową szansę i uratował przed przegraną!`;
    }
    if (result.ananasSaved) {
      replyText += `\n🍕 Przedmiot **Ananas na Pizzy** dał Ci dodatkową szansę i uratował przed przegraną!`;
    }
    if (result.kosciRefunded) {
      replyText += `\n🎲 Przedmiot **Kości Oszusta** uratował Cię przed stratą i zwrócił całą stawkę!`;
    }

    if (result.xpResult && result.xpResult.leveledUp) {
      replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
      if (result.xpResult.milestonesGained && result.xpResult.milestonesGained.length > 0) {
        const { getMilestoneRewardDescription } = require('../utils/economy');
        for (const lvl of result.xpResult.milestonesGained) {
          replyText += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
        }
      }
    }

    await message.reply(replyText);
  }
};
