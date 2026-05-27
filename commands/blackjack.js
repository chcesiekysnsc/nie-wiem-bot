const config = require('../config/config');
const {
  formatCurrency,
  formatNumber,
  recordGame,
  refreshBadges,
  resolveAmount,
  ensureInventoryRecord,
  hasItem
} = require('../utils/economy');
const { createUser, withData, loadData } = require('../utils/storage');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getHandValue(cards) {
  let value = 0;
  let acesCount = 0;
  for (const card of cards) {
    if (card.rank === 'A') {
      value += 11;
      acesCount++;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      value += 10;
    } else {
      value += Number(card.rank);
    }
  }
  while (value > 21 && acesCount > 0) {
    value -= 10;
    acesCount--;
  }
  return value;
}

function renderHand(cards, hideSecond = false) {
  if (hideSecond && cards.length > 1) {
    return `[${cards[0].rank}${cards[0].suit}] [❓]`;
  }
  return cards.map(c => `[${c.rank}${c.suit}]`).join(' ');
}

function drawCardForPlayer(game, hasDealerItem) {
  let card = game.deck.pop();
  if (hasDealerItem && Math.random() < 0.03 && game.deck.length > 0) {
    const nextCard = game.deck[game.deck.length - 1];
    const currentVal = getHandValue([...game.playerCards, card]);
    const nextVal = getHandValue([...game.playerCards, nextCard]);
    
    let swap = false;
    if (currentVal > 21 && nextVal <= 21) {
      swap = true;
    } else if (currentVal <= 21 && nextVal <= 21 && nextVal > currentVal) {
      swap = true;
    }
    
    if (swap) {
      const actualNext = game.deck.pop();
      game.deck.unshift(card);
      card = actualNext;
      card.isCheat = true;
    }
  }
  game.playerCards.push(card);
  return card;
}

module.exports = {
  name: 'blackjack',
  aliases: ['bj'],
  async execute(client, message, args) {
    const authorId = message.author.id;
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    // Inicjalizacja mapy gier na kliencie, jeśli nie istnieje
    if (!client.activeBlackjackGames) {
      client.activeBlackjackGames = new Map();
    }

    if (client.activeBlackjackGames.has(authorId)) {
      await message.reply('❌ Masz już aktywną grę w Blackjacka! Napisz **hit** (dobierz), **stand** (stop) lub **double** (podwój).');
      return;
    }

    const rawBet = args[0];
    if (!rawBet) {
      await message.reply('❌ Użyj: **!blackjack <kwota>** lub **!bj <kwota>**');
      return;
    }

    const result = await withData(store => {
      const user = createUser(authorId, store.users);
      const bet = resolveAmount(rawBet, user.balance);

      if (!bet || bet <= 0) {
        return { error: '❌ Podaj poprawną kwotę betu.' };
      }

      if (bet > user.balance) {
        return { error: `❌ Brak wystarczających środków w portfelu. Posiadasz: ${formatCurrency(user.balance)}` };
      }

      // Pobierz stawkę z balansu gracza na czas gry
      user.balance -= bet;
      return { success: true, bet };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const bet = result.bet;
    const deck = shuffle(createDeck());
    const playerCards = [deck.pop(), deck.pop()];
    const dealerCards = [deck.pop(), deck.pop()];

    const playerValue = getHandValue(playerCards);
    const isPlayerBJ = playerValue === 21;

    if (isPlayerBJ) {
      // Natychmiastowa rozgrywka krupiera w przypadku Blackjacka gracza
      let dealerValue = getHandValue(dealerCards);
      while (dealerValue < 17) {
        dealerCards.push(deck.pop());
        dealerValue = getHandValue(dealerCards);
      }

      const isDealerBJ = dealerValue === 21 && dealerCards.length === 2;
      let payout = 0;
      let outcome = '';
      let net = 0;

      if (isDealerBJ) {
        // Remis (Push)
        payout = bet;
        outcome = 'Push! Zarówno Ty, jak i Krupier macie Blackjacka. Otrzymujesz zwrot stawki.';
        net = 0;
      } else {
        // Wygrana z Blackjackiem (x2.5)
        payout = Math.round(bet * 2.5);
        outcome = `🎉 **BLACKJACK!** Wygrywasz z bonusem x2.5! Otrzymujesz **${formatCurrency(payout)}**!`;
        net = payout - bet;
      }

      const dbResult = await withData(store => {
        const user = createUser(authorId, store.users);
        const inventory = ensureInventoryRecord(store.inventory, authorId);
        if (payout > bet && user.badges && user.badges.includes(config.badges.uzalezniony)) {
          const profit = payout - bet;
          payout += Math.round(profit * 0.03);
          net = payout - bet;
        }
        user.balance += payout;
        const xpResult = recordGame(user, net, 25, inventory);
        refreshBadges(user, inventory);
        return { balance: user.balance, xpResult };
      });

      let replyText = `🃏 **Gra w Blackjacka rozstrzygnięta!**\n\n` +
        `👨‍💼 Krupier: ${renderHand(dealerCards)} (Wartość: ${dealerValue} pkt)\n` +
        `👤 Twoja Ręka: ${renderHand(playerCards)} (Wartość: 21 pkt)\n\n` +
        `${outcome}\n` +
        `Twój balans: **${formatCurrency(dbResult.balance)}**`;

      if (dbResult.xpResult && dbResult.xpResult.leveledUp) {
        replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${dbResult.xpResult.newLevel}**!`;
        if (dbResult.xpResult.milestonesGained && dbResult.xpResult.milestonesGained.length > 0) {
          const { getMilestoneRewardDescription } = require('../utils/economy');
          for (const lvl of dbResult.xpResult.milestonesGained) {
            replyText += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
          }
        }
      }

      await message.reply(replyText);
      return;
    }

    // Zapisz stan gry
    client.activeBlackjackGames.set(authorId, {
      bet,
      playerCards,
      dealerCards,
      deck,
      threadId
    });

    await message.reply(
      `🃏 **Gra w Blackjacka rozpoczęta!**\n` +
      `Stawka: **${formatCurrency(bet)}**\n\n` +
      `Twój ruch: wpisz **hit** (dobierz), **stand** (stop) lub **double** (podwój).\n\n` +
      `👨‍💼 Krupier: ${renderHand(dealerCards, true)} (Wartość: ?)\n` +
      `👤 Twoja Ręka: ${renderHand(playerCards)} (Wartość: ${playerValue} pkt)`
    );
  },

  // Obsługa ruchów gracza
  async handleAction(client, message, action) {
    const authorId = message.author.id;
    const game = client.activeBlackjackGames.get(authorId);

    if (!game) return;

    let playerValue = getHandValue(game.playerCards);

    if (action === 'hit' || action === 'dobierz') {
      const inventoryData = loadData('inventory');
      const inventoryRecord = ensureInventoryRecord(inventoryData, authorId);
      const hasDealerItem = hasItem(inventoryRecord, 'przekupiony_krupier');

      const drawnCard = drawCardForPlayer(game, hasDealerItem);
      playerValue = getHandValue(game.playerCards);
      const cheatNote = drawnCard.isCheat ? '\n🧠 *Krupier dyskretnie wsunął Ci korzystniejszą kartę...*' : '';

      if (playerValue > 21) {
        // Przegrana (Bust)
        const dealerValue = getHandValue(game.dealerCards);
        const dbResult = await withData(store => {
          const user = createUser(authorId, store.users);
          const inventory = ensureInventoryRecord(store.inventory, authorId);
          
          let payout = 0;
          let net = -game.bet;
          let outcomeText = `Tracisz **${formatCurrency(game.bet)}**.`;

          let helperChance = 0;
          if (user.badges) {
            if (user.badges.includes(config.badges.bog)) helperChance = 0.02;
            else if (user.badges.includes(config.badges.rekin)) helperChance = 0.01;
            else if (user.badges.includes(config.badges.hazardzista)) helperChance = 0.005;
          }
          if (hasItem(inventory, 'szkarlatne_oko')) {
            helperChance += 0.015;
          }
          if (helperChance > 0 && Math.random() < helperChance) {
            payout = game.bet;
            net = 0;
            outcomeText = ` Uratowany! Dzięki Twoim bonusom (odznaki/przedmioty) unikasz porażki i otrzymujesz zwrot stawki.`;
          }

          user.balance += payout;
          const xpResult = recordGame(user, net, 25, inventory);
          refreshBadges(user, inventory);
          return { balance: user.balance, xpResult, outcomeText };
        });

        let replyText = `💥 **Przegrana (Bust!)** - przekroczyłeś 21 punktów.${cheatNote}\n\n` +
          `👨‍💼 Krupier: ${renderHand(game.dealerCards)} (Wartość: ${dealerValue} pkt)\n` +
          `👤 Twoja Ręka: ${renderHand(game.playerCards)} (Wartość: ${playerValue} pkt)\n\n` +
          `${dbResult.outcomeText} Twój balans: **${formatCurrency(dbResult.balance)}**`;

        if (dbResult.xpResult && dbResult.xpResult.leveledUp) {
          replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${dbResult.xpResult.newLevel}**!`;
          if (dbResult.xpResult.milestonesGained && dbResult.xpResult.milestonesGained.length > 0) {
            const { getMilestoneRewardDescription } = require('../utils/economy');
            for (const lvl of dbResult.xpResult.milestonesGained) {
              replyText += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
            }
          }
        }

        await message.reply(replyText);
        client.activeBlackjackGames.delete(authorId);
      } else if (playerValue === 21) {
        // Automatyczny stand przy 21
        await this.handleAction(client, message, 'stand');
      } else {
        // Gra toczy się dalej
        await message.reply(
          `🃏 **Blackjack (Kolejna karta)**${cheatNote}\n` +
          `Stawka: **${formatCurrency(game.bet)}**\n\n` +
          `Twój ruch: wpisz **hit** (dobierz) lub **stand** (stop).\n\n` +
          `👨‍💼 Krupier: ${renderHand(game.dealerCards, true)} (Wartość: ?)\n` +
          `👤 Twoja Ręka: ${renderHand(game.playerCards)} (Wartość: ${playerValue} pkt)`
        );
      }
    } else if (action === 'double' || action === 'podwoj') {
      if (game.playerCards.length !== 2) {
        await message.reply('❌ Podwoić stawkę możesz tylko w pierwszej rundzie (posiadając dokładnie 2 karty)!');
        return;
      }

      // Sprawdź czy stać na podwojenie
      const canDouble = await withData(store => {
        const user = createUser(authorId, store.users);
        if (user.balance < game.bet) {
          return false;
        }
        user.balance -= game.bet;
        return true;
      });

      if (!canDouble) {
        await message.reply(`❌ Nie masz wystarczająco środków, aby podwoić stawkę! Potrzebujesz dodatkowe **${formatCurrency(game.bet)}**.`);
        return;
      }

      game.bet *= 2;
      const inventoryData = loadData('inventory');
      const inventoryRecord = ensureInventoryRecord(inventoryData, authorId);
      const hasDealerItem = hasItem(inventoryRecord, 'przekupiony_krupier');

      const drawnCard = drawCardForPlayer(game, hasDealerItem);
      playerValue = getHandValue(game.playerCards);
      const cheatNote = drawnCard.isCheat ? '\n🧠 *Krupier dyskretnie wsunął Ci korzystniejszą kartę...*' : '';

      if (playerValue > 21) {
        // Przegrana (Bust) przy podwojeniu
        const dealerValue = getHandValue(game.dealerCards);
        const dbResult = await withData(store => {
          const user = createUser(authorId, store.users);
          const inventory = ensureInventoryRecord(store.inventory, authorId);
          
          let payout = 0;
          let net = -game.bet;
          let outcomeText = `Tracisz **${formatCurrency(game.bet)}**.`;

          let helperChance = 0;
          if (user.badges) {
            if (user.badges.includes(config.badges.bog)) helperChance = 0.02;
            else if (user.badges.includes(config.badges.rekin)) helperChance = 0.01;
            else if (user.badges.includes(config.badges.hazardzista)) helperChance = 0.005;
          }
          if (hasItem(inventory, 'szkarlatne_oko')) {
            helperChance += 0.015;
          }
          if (helperChance > 0 && Math.random() < helperChance) {
            payout = game.bet;
            net = 0;
            outcomeText = ` Uratowany! Dzięki Twoim bonusom (odznaki/przedmioty) unikasz porażki i otrzymujesz zwrot stawki.`;
          }

          user.balance += payout;
          const xpResult = recordGame(user, net, 25, inventory);
          refreshBadges(user, inventory);
          return { balance: user.balance, xpResult, outcomeText };
        });

        let replyText = `💥 **Przegrana (Bust!) przy podwojeniu** - przekroczyłeś 21 punktów.${cheatNote}\n\n` +
          `👨‍💼 Krupier: ${renderHand(game.dealerCards)} (Wartość: ${dealerValue} pkt)\n` +
          `👤 Twoja Ręka: ${renderHand(game.playerCards)} (Wartość: ${playerValue} pkt)\n\n` +
          `${dbResult.outcomeText} Twój balans: **${formatCurrency(dbResult.balance)}**`;

        if (dbResult.xpResult && dbResult.xpResult.leveledUp) {
          replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${dbResult.xpResult.newLevel}**!`;
          if (dbResult.xpResult.milestonesGained && dbResult.xpResult.milestonesGained.length > 0) {
            const { getMilestoneRewardDescription } = require('../utils/economy');
            for (const lvl of dbResult.xpResult.milestonesGained) {
              replyText += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
            }
          }
        }

        await message.reply(replyText);
        client.activeBlackjackGames.delete(authorId);
      } else {
        // Automatyczne zatrzymanie (stand) po dobraniu 1 karty przy double
        await this.executeDealerTurn(client, message, game, playerValue, cheatNote);
      }
    } else if (action === 'stand' || action === 'stop') {
      await this.executeDealerTurn(client, message, game, playerValue);
    }
  },

  async executeDealerTurn(client, message, game, playerValue, cheatNote = '') {
    const authorId = message.author.id;
    let dealerValue = getHandValue(game.dealerCards);

    // Krupier dobiera do 17
    while (dealerValue < 17) {
      game.dealerCards.push(game.deck.pop());
      dealerValue = getHandValue(game.dealerCards);
    }

    let payout = 0;
    let outcome = '';
    let net = 0;

    if (dealerValue > 21) {
      // Krupier przekroczył 21 - wygrana gracza
      payout = game.bet * 2;
      outcome = `🎉 **Wygrana!** Krupier przekroczył 21 punktów (Bust!).`;
      net = game.bet;
    } else if (playerValue > dealerValue) {
      // Gracz ma więcej punktów
      payout = game.bet * 2;
      outcome = `🎉 **Wygrana!** Masz więcej punktów niż krupier.`;
      net = game.bet;
    } else if (playerValue === dealerValue) {
      // Remis (Push)
      payout = game.bet;
      outcome = `⚖️ **Push!** Remisujesz z krupierem. Otrzymujesz zwrot stawki.`;
      net = 0;
    } else {
      // Przegrana
      payout = 0;
      outcome = `❌ **Przegrana!** Krupier ma więcej punktów.`;
      net = -game.bet;
    }

    const dbResult = await withData(store => {
      const user = createUser(authorId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, authorId);
      
      let finalPayout = payout;
      let finalNet = net;
      let finalOutcome = outcome;

      if (payout === 0 && net < 0) {
        let helperChance = 0;
        if (user.badges) {
          if (user.badges.includes(config.badges.bog)) helperChance = 0.02;
          else if (user.badges.includes(config.badges.rekin)) helperChance = 0.01;
          else if (user.badges.includes(config.badges.hazardzista)) helperChance = 0.005;
        }
        if (hasItem(inventory, 'szkarlatne_oko')) {
          helperChance += 0.015;
        }
        if (helperChance > 0 && Math.random() < helperChance) {
          finalPayout = game.bet;
          finalNet = 0;
          finalOutcome = `⚖️ **Push (Uratowany!)** - Dzięki Twoim bonusom (odznaki/przedmioty) unikasz porażki i otrzymujesz zwrot stawki.`;
        }
      }

      if (finalPayout > game.bet && user.badges && user.badges.includes(config.badges.uzalezniony)) {
        const profit = finalPayout - game.bet;
        finalPayout += Math.round(profit * 0.03);
        finalNet = finalPayout - game.bet;
      }

      user.balance += finalPayout;
      const xpResult = recordGame(user, finalNet, 25, inventory);
      refreshBadges(user, inventory);
      return { balance: user.balance, xpResult, outcome: finalOutcome };
    });

    let replyText = `🃏 **Koniec gry w Blackjacka!**${cheatNote}\n\n` +
      `👨‍💼 Krupier: ${renderHand(game.dealerCards)} (Wartość: ${dealerValue} pkt)\n` +
      `👤 Twoja Ręka: ${renderHand(game.playerCards)} (Wartość: ${playerValue} pkt)\n\n` +
      `${dbResult.outcome}\n` +
      `Twój balans: **${formatCurrency(dbResult.balance)}**`;

    if (dbResult.xpResult && dbResult.xpResult.leveledUp) {
      replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${dbResult.xpResult.newLevel}**!`;
      if (dbResult.xpResult.milestonesGained && dbResult.xpResult.milestonesGained.length > 0) {
        const { getMilestoneRewardDescription } = require('../utils/economy');
        for (const lvl of dbResult.xpResult.milestonesGained) {
          replyText += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
        }
      }
    }

    await message.reply(replyText);

    client.activeBlackjackGames.delete(authorId);
  }
};
