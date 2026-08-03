const config = require('../config/config');
const {
  formatCurrency,
  formatNumber,
  recordGame,
  refreshBadges,
  resolveAmount,
  ensureInventoryRecord,
  hasItem,
  getPassiveMultiplier,
  getActiveEventMultiplier,
  getCasinoWinMultiplier,
  getDealerBonusChance,
  getRandomXp
} = require('../utils/economy');
const { createUser, withData, loadData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { saveGameSessions } = require('../utils/gameStatePersistence');
const { advanceChallenge } = require('../utils/challenges');

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
  const validCards = (cards || []).filter(Boolean);
  for (const card of validCards) {
    if (card.rank === 'A') {
      value += 11;
      acesCount++;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      value += 10;
    } else if (card.rank) {
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
  const validCards = (cards || []).filter(Boolean);
  if (hideSecond && validCards.length > 0) {
    return `[${validCards[0].rank}${validCards[0].suit}] [❓]`;
  }
  return validCards.map(c => `[${c.rank}${c.suit}]`).join(' ');
}

function drawCardForPlayer(game, dealerCheatChance) {
  if (game.deck.length === 0) return null;
  let card = game.deck.pop();
  if (dealerCheatChance > 0 && Math.random() < dealerCheatChance && game.deck.length > 0) {
    const nextCard = game.deck[game.deck.length - 1];
    const currentVal = getHandValue([...game.playerCards, card]);
    const nextVal = getHandValue([...game.playerCards, nextCard]);
    
    let swap = false;
    let cheatDetails = '';
    if (currentVal > 21 && nextVal <= 21) {
      swap = true;
      cheatDetails = `zamienił kartę [${card.rank}${card.suit}] (dającą furaż: ${currentVal} pkt) na bezpieczniejszą [${nextCard.rank}${nextCard.suit}] (dającą ${nextVal} pkt)`;
    } else if (currentVal <= 21 && nextVal <= 21 && nextVal > currentVal) {
      swap = true;
      cheatDetails = `zamienił kartę [${card.rank}${card.suit}] (dającą ${currentVal} pkt) na lepszą [${nextCard.rank}${nextCard.suit}] (dającą ${nextVal} pkt)`;
    }
    
    if (swap) {
      const actualNext = game.deck.pop();
      game.deck.unshift(card);
      card = actualNext;
      card.isCheat = true;
      card.cheatDetails = cheatDetails;
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
      const activeGame = client.activeBlackjackGames.get(authorId);
      if (Date.now() - (activeGame.timestamp || 0) > 300000) {
        client.activeBlackjackGames.delete(authorId);
        saveGameSessions(client);
      } else {
        const action = String(args[0] || '').toLowerCase().trim();
        if (['hit', 'stand', 'double', 'dobierz', 'stop', 'podwoj'].includes(action)) {
          await this.handleAction(client, message, action);
          return;
        }
        await message.reply('❌ Masz już aktywną grę w Blackjacka! Napisz **hit** (dobierz), **stand** (stop) lub **double** (podwój).');
        return;
      }
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
      let basePayout = 0;
      let baseOutcome = '';

      if (isDealerBJ) {
        // Remis (Push)
        basePayout = bet;
        baseOutcome = 'Push! Zarówno Ty, jak i Krupier macie Blackjacka. Otrzymujesz zwrot stawki.';
      } else {
        // Wygrana z Blackjackiem (x2.5)
        basePayout = Math.round(bet * 2.5);
        baseOutcome = `🎉 **BLACKJACK!** Wygrywasz z bonusem x2.5! Otrzymujesz **${formatCurrency(basePayout)}**!`;
      }

      const dbResult = await withData(store => {
        const user = createUser(authorId, store.users);
        const inventory = ensureInventoryRecord(store.inventory, authorId);

        let finalPayout = basePayout;
        let finalNet = finalPayout - bet;

        // Uzależniony badge: +3% do profitu
        if (finalPayout > bet && user.badges && user.badges.includes(config.badges.uzalezniony)) {
          const profit = finalPayout - bet;
          finalPayout += Math.round(profit * 0.03);
          finalNet = finalPayout - bet;
        }

        // Casino win multiplier (zestawy przedmiotów)
        const casinoWinBonus = getCasinoWinMultiplier(inventory);
        if (casinoWinBonus > 0 && finalPayout > bet) {
          const profit = finalPayout - bet;
          finalPayout += Math.floor(profit * casinoWinBonus);
          finalNet = finalPayout - bet;
        }

        let talizmanBonus = 0;
        if (finalPayout > bet) {
          // Event multiplier
          const evMul = getActiveEventMultiplier('casino');
          if (evMul > 1) {
            const profit = finalPayout - bet;
            finalPayout = bet + Math.round(profit * evMul);
          }
          // Królewskie Insygnia: +10%
          if (hasItem(inventory, 'krolewskie_insygnia')) {
            const profit = finalPayout - bet;
            if (profit > 0) {
              finalPayout += Math.floor(profit * 0.10);
            }
          }
          // Talizman Fortuny
          const profit = finalPayout - bet;
          const { applyTalizmanBonus } = require('../utils/economy');
          talizmanBonus = applyTalizmanBonus(user, inventory, profit);
          finalPayout += talizmanBonus;
          finalNet = finalPayout - bet;
        }

        user.balance += finalPayout;
        const xpResult = recordGame(user, finalNet, getRandomXp(), inventory);
        refreshBadges(user, inventory);
        const challengeUpdate = finalNet > 0 ? advanceChallenge(message.author.id, store, 'blackjack_wins') : null;
        return { balance: user.balance, xpResult, talizmanBonus, streak: user.gambleStreak || 0, finalPayout, finalNet, challengeUpdate };
      });

      let replyText = `🃏 **Gra w Blackjacka rozstrzygnięta!**\n\n` +
        `👨‍💼 Krupier: ${renderHand(dealerCards)} (Wartość: ${dealerValue} pkt)\n` +
        `👤 Twoja Ręka: ${renderHand(playerCards)} (Wartość: 21 pkt)\n\n` +
        `${baseOutcome}\n` +
        `Twój balans: **${formatCurrency(dbResult.balance)}**`;

      if (dbResult.finalPayout > bet && dbResult.talizmanBonus > 0) {
        replyText += `\n📿 **Talizman Fortuny:** Otrzymujesz bonus **+${formatCurrency(dbResult.talizmanBonus)}** (seria: ${dbResult.streak} wygranych pod rząd)`;
      }

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
      threadId,
      timestamp: Date.now()
    });
    saveGameSessions(client);

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
    if (game.processing) return;
    game.processing = true;

    try {
      let playerValue = getHandValue(game.playerCards);

      if (action === 'hit' || action === 'dobierz') {
      const inventoryData = loadData('inventory');
      const inventoryRecord = ensureInventoryRecord(inventoryData, authorId);
      const dealerCheatChance = getDealerBonusChance(inventoryRecord);

      const drawnCard = drawCardForPlayer(game, dealerCheatChance);
      playerValue = getHandValue(game.playerCards);
      const cheatNote = drawnCard.isCheat ? `\n🧠 **Przekupiony Krupier:** *Krupier dyskretnie wsunął Ci korzystniejszą kartę: ${drawnCard.cheatDetails}!*` : '';

      if (playerValue > 21) {
        const bjLuckOverride = await getEffectiveChance(authorId, 'blackjack_save_luck');
        const dealerValue = getHandValue(game.dealerCards);
        const dbResult = await withData(store => {
          const user = createUser(authorId, store.users);
          const inventory = ensureInventoryRecord(store.inventory, authorId);
          
          let payout = 0;
          let net = -game.bet;
          let outcomeText = `Tracisz **${formatCurrency(game.bet)}**.`;

          let helperChance = 0;
          let badgeChance = 0;
          let activeBadgeName = '';
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
          if (Number.isFinite(bjLuckOverride) && bjLuckOverride > 0) {
            helperChance += bjLuckOverride / 100;
          }

          let wasRescued = false;
          if (helperChance > 0) {
            const secondRoll = Math.random();
            if (secondRoll < helperChance) {
              payout = game.bet;
              net = 0;
              let saveSource = 'Twoim bonusom';
              let current = 0;
              if (secondRoll < (current += badgeChance)) {
                saveSource = `odznace **${activeBadgeName}**`;
              } else if (hasOko && secondRoll < (current += 0.015)) {
                saveSource = 'pasywnemu przedmiotowi 👁️ Szkarłatne Oko Krupiera';
              } else if (ananasBonus > 0 && secondRoll < (current += ananasBonus)) {
                saveSource = 'pasywnemu przedmiotowi 🍕 Ananas na Pizzy';
              }
              outcomeText = ` Uratowany! Dzięki ${saveSource} unikasz porażki i otrzymujesz zwrot stawki.`;
              wasRescued = true;
            }
          }

          if (!wasRescued) {
            const kosciBonusPct = getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02);
            if (kosciBonusPct > 0 && Math.random() < kosciBonusPct) {
              payout = game.bet;
              net = 0;
              outcomeText = ` Uratowany! Dzięki przedmiotowi 🎲 Kości Oszusta otrzymujesz zwrot pełnej stawki!`;
            }
          }

          user.balance += payout;
          const xpResult = recordGame(user, net, getRandomXp(), inventory);
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
        saveGameSessions(client);
      } else if (playerValue === 21) {
        // Automatyczny stand przy 21
        await this.executeDealerTurn(client, message, game, playerValue, cheatNote);
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
      const dealerCheatChance = getDealerBonusChance(inventoryRecord);

      const drawnCard = drawCardForPlayer(game, dealerCheatChance);
      playerValue = getHandValue(game.playerCards);
      const cheatNote = drawnCard.isCheat ? `\n🧠 **Przekupiony Krupier:** *Krupier dyskretnie wsunął Ci korzystniejszą kartę: ${drawnCard.cheatDetails}!*` : '';

      if (playerValue > 21) {
        const bjLuckOverride = await getEffectiveChance(authorId, 'blackjack_save_luck');
        // Przegrana (Bust) przy podwojeniu
        const dealerValue = getHandValue(game.dealerCards);
        const dbResult = await withData(store => {
          const user = createUser(authorId, store.users);
          const inventory = ensureInventoryRecord(store.inventory, authorId);
          
          let payout = 0;
          let net = -game.bet;
          let outcomeText = `Tracisz **${formatCurrency(game.bet)}**.`;

          let helperChance = 0;
          let badgeChance = 0;
          let activeBadgeName = '';
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
          if (Number.isFinite(bjLuckOverride) && bjLuckOverride > 0) {
            helperChance += bjLuckOverride / 100;
          }

          let wasRescued = false;
          if (helperChance > 0) {
            const secondRoll = Math.random();
            if (secondRoll < helperChance) {
              payout = game.bet;
              net = 0;
              let saveSource = 'Twoim bonusom';
              let current = 0;
              if (secondRoll < (current += badgeChance)) {
                saveSource = `odznace **${activeBadgeName}**`;
              } else if (hasOko && secondRoll < (current += 0.015)) {
                saveSource = 'pasywnemu przedmiotowi 👁️ Szkarłatne Oko Krupiera';
              } else if (ananasBonus > 0 && secondRoll < (current += ananasBonus)) {
                saveSource = 'pasywnemu przedmiotowi 🍕 Ananas na Pizzy';
              }
              outcomeText = ` Uratowany! Dzięki ${saveSource} unikasz porażki i otrzymujesz zwrot stawki.`;
              wasRescued = true;
            }
          }

          if (!wasRescued) {
            const kosciBonusPct = getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02);
            if (kosciBonusPct > 0 && Math.random() < kosciBonusPct) {
              payout = game.bet;
              net = 0;
              outcomeText = ` Uratowany! Dzięki przedmiotowi 🎲 Kości Oszusta otrzymujesz zwrot pełnej stawki!`;
            }
          }

          user.balance += payout;
          const xpResult = recordGame(user, net, getRandomXp(), inventory);
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
        saveGameSessions(client);
      } else {
        // Automatyczne zatrzymanie (stand) po dobraniu 1 karty przy double
        await this.executeDealerTurn(client, message, game, playerValue, cheatNote);
      }
    } else if (action === 'stand' || action === 'stop') {
      await this.executeDealerTurn(client, message, game, playerValue);
    }
  } catch (err) {
    console.error('[BLACKJACK] Błąd podczas obsługi ruchu:', err);
    client.activeBlackjackGames.delete(authorId);
    saveGameSessions(client);
  } finally {
    if (client.activeBlackjackGames.has(authorId)) {
      game.processing = false;
    }
  }
  },

  async executeDealerTurn(client, message, game, playerValue, cheatNote = '') {
    const authorId = message.author.id;
    let dealerValue = getHandValue(game.dealerCards);

    // Krupier dobiera do 17
    while (dealerValue < 17 && game.deck.length > 0) {
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

    const bjLuckOverride = await getEffectiveChance(authorId, 'blackjack_save_luck');

    const dbResult = await withData(store => {
      const user = createUser(authorId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, authorId);
      
      let finalPayout = payout;
      let finalNet = net;
      let finalOutcome = outcome;

      if (payout === 0 && net < 0) {
        let helperChance = 0;
        let badgeChance = 0;
        let activeBadgeName = '';
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
        if (Number.isFinite(bjLuckOverride) && bjLuckOverride > 0) {
          helperChance += bjLuckOverride / 100;
        }

        let wasRescued = false;
        if (helperChance > 0) {
          const secondRoll = Math.random();
          if (secondRoll < helperChance) {
            finalPayout = game.bet;
            finalNet = 0;
            let saveSource = 'Twoim bonusom';
            let current = 0;
            if (secondRoll < (current += badgeChance)) {
              saveSource = `odznace **${activeBadgeName}**`;
            } else if (hasOko && secondRoll < (current += 0.015)) {
              saveSource = 'pasywnemu przedmiotowi 👁️ Szkarłatne Oko Krupiera';
            } else if (ananasBonus > 0 && secondRoll < (current += ananasBonus)) {
              saveSource = 'pasywnemu przedmiotowi 🍕 Ananas na Pizzy';
            }
            finalOutcome = `⚖️ **Push (Uratowany!)** - Dzięki ${saveSource} unikasz porażki i otrzymujesz zwrot stawki.`;
            wasRescued = true;
          }
        }

        if (!wasRescued) {
          const kosciBonusPct = getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02);
          if (kosciBonusPct > 0 && Math.random() < kosciBonusPct) {
            finalPayout = game.bet;
            finalNet = 0;
            finalOutcome = `❌ **Przegrana!** Krupier ma więcej punktów. Jednak dzięki przedmiotowi 🎲 Kości Oszusta otrzymujesz zwrot pełnej stawki!`;
          }
        }
      }

      if (finalPayout > game.bet && user.badges && user.badges.includes(config.badges.uzalezniony)) {
        const profit = finalPayout - game.bet;
        finalPayout += Math.round(profit * 0.03);
        finalNet = finalPayout - game.bet;
      }

      const casinoWinBonus = getCasinoWinMultiplier(inventory);
      if (casinoWinBonus > 0 && finalPayout > game.bet) {
        const profit = finalPayout - game.bet;
        finalPayout += Math.floor(profit * casinoWinBonus);
        finalNet = finalPayout - game.bet;
      }

      let talizmanBonus = 0;
      if (finalPayout > game.bet) {
        const evMul = getActiveEventMultiplier('casino');
        if (evMul > 1) {
          const profit = finalPayout - game.bet;
          finalPayout = game.bet + Math.round(profit * evMul);
        }
        if (hasItem(inventory, 'krolewskie_insygnia')) {
          const profit = finalPayout - game.bet;
          if (profit > 0) {
            finalPayout += Math.floor(profit * 0.10);
          }
        }
        const profit = finalPayout - game.bet;
        const { applyTalizmanBonus } = require('../utils/economy');
        talizmanBonus = applyTalizmanBonus(user, inventory, profit);
        finalPayout += talizmanBonus;
        finalNet = finalPayout - game.bet;
      }

      user.balance += finalPayout;
      const xpResult = recordGame(user, finalNet, getRandomXp(), inventory);
      refreshBadges(user, inventory);
      const challengeUpdate = finalNet > 0 ? advanceChallenge(message.author.id, store, 'blackjack_wins') : null;
      return { balance: user.balance, xpResult, outcome: finalOutcome, talizmanBonus, streak: user.gambleStreak || 0, challengeUpdate };
    });

    let replyText = `🃏 **Koniec gry w Blackjacka!**${cheatNote}\n\n` +
      `👨‍💼 Krupier: ${renderHand(game.dealerCards)} (Wartość: ${dealerValue} pkt)\n` +
      `👤 Twoja Ręka: ${renderHand(game.playerCards)} (Wartość: ${playerValue} pkt)\n\n` +
      `${dbResult.outcome}\n` +
      `Twój balans: **${formatCurrency(dbResult.balance)}**`;

    const wonHand = dbResult.outcome.includes('Wygrana');
    if (wonHand && dbResult.talizmanBonus > 0) {
      replyText += `\n📿 **Talizman Fortuny:** Otrzymujesz bonus **+${formatCurrency(dbResult.talizmanBonus)}** (seria: ${dbResult.streak} wygranych pod rząd)`;
    }

    const cheated = game.playerCards.some(c => c.isCheat);
    if (wonHand && cheated) {
      replyText += `\n🧠 Ta wygrana została ułatwiona przez pasywny przedmiot **Przekupiony Krupier**!`;
    }

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
    saveGameSessions(client);
  }
};
