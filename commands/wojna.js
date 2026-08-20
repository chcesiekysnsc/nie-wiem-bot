const config = require('../config/config');
const { ensureInventoryRecord, formatCurrency, recordGame, refreshBadges,   resolveAmount,
  getRandomXp
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { advanceChallenge } = require('../utils/challenges');
const { saveGameSessions } = require('../utils/gameStatePersistence');

const CARD_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'Walet (J)', 12: 'Dama (Q)', 13: 'Król (K)', 14: 'As (A)'
};

const SUIT_EMOJIS = {
  4: '♠️ Pik',
  3: '♥️ Kier',
  2: '♦️ Karo',
  1: '♣️ Trefl'
};

module.exports = {
  name: 'wojna',
  aliases: ['cardwar'],
  resumeLobby,
  async execute(client, message, args) {
    client.warSessions = client.warSessions || new Map();
    const threadId = message.guild?.id || message.rawEvent?.threadID || 'default_thread';
    const sub = String(args[0] || '').toLowerCase().trim();

    // ==========================================
    // 1. JOIN LOBBY
    // ==========================================
    if (sub === 'dolacz' || sub === 'd') {
      const session = client.warSessions.get(threadId);
      if (!session) {
        await message.reply('❌ Brak aktywnej poczekalni wojny karcianej. Wpisz **!wojna <kwota>**, aby stworzyć nową grę.');
        return;
      }

      if (session.state !== 'lobby') {
        await message.reply('❌ Zapisy do tej gry zostały już zamknięte.');
        return;
      }

      if (session.participants.includes(message.author.id)) {
        await message.reply('❌ Już dołączyłeś do tej rozgrywki.');
        return;
      }

      if (session.participants.length >= 12) {
        await message.reply('❌ Poczekalnia jest pełna (maksymalnie 12 graczy).');
        return;
      }

      const joinResult = await withData(store => {
        const user = createUser(message.author.id, store.users);
        if (user.balance < session.bet) {
          return { error: `❌ Brak wystarczających środków w portfelu. Wpisowe wynosi: ${formatCurrency(session.bet)}` };
        }
        user.balance -= session.bet;
        return { success: true };
      });

      if (joinResult.error) {
        await message.reply(joinResult.error).catch(() => null);
        return;
      }

      session.participants.push(message.author.id);
      saveGameSessions(client);
      await message.reply(`✅ Dołączyłeś do wojny karcianej! Gracze: **${session.participants.length}/12**.`).catch(() => null);
      return;
    }

    // ==========================================
    // 2. SHOW GAME STATUS
    // ==========================================
    if (!sub || sub === 'status' || sub === 'info') {
      const session = client.warSessions.get(threadId);
      if (!session) {
        await message.reply(
          `🎴 **WOJNA KARCIANA** 🎴\n` +
          `Brak aktywnej gry w tym wątku.\n\n` +
          `Wpisz **!wojna <kwota>**, aby otworzyć poczekalnię na 90s i zaprosić do 12 graczy!`
        );
        return;
      }

      const hostName = await client.resolveUserName(session.hostId);
      const listNames = [];
      for (const pid of session.participants) {
        const name = await client.resolveUserName(pid);
        listNames.push(name);
      }

      if (session.state === 'lobby') {
        const elapsed = Date.now() - session.startTime;
        const remaining = Math.max(0, Math.ceil((session.lobbyDuration - elapsed) / 1000));

        await message.reply(
          `🎴 **POCZEKALNIA WOJNY KARCIANEJ** 🎴\n` +
          `Założyciel: **${hostName}**\n` +
          `Wpisowe: **${formatCurrency(session.bet)}**\n` +
          `Liczba graczy: **${session.participants.length}/12**\n` +
          `Uczestnicy: ${listNames.join(', ')}\n` +
          `Pozostały czas na dołączenie: **${remaining}s**\n\n` +
          `👉 Wpisz **!wojna dolacz**, aby wejść do gry ze stawką **${formatCurrency(session.bet)}**!`
        ).catch(() => null);
      } else {
        await message.reply(
          `🎴 **WOJNA KARCIANA** 🎴\n` +
          `Rozgrywka w toku...\n` +
          `Stawka: **${formatCurrency(session.bet)}**\n` +
          `Uczestnicy: ${listNames.join(', ')}`
        ).catch(() => null);
      }
      return;
    }

    // ==========================================
    // 3. START LOBBY WITH A BET
    // ==========================================
    const session = client.warSessions.get(threadId);
    if (session) {
      await message.reply('❌ Na tej grupie trwa już rozgrywka lub zapisy do wojny karcianej!').catch(() => null);
      return;
    }

    const betResult = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const bet = resolveAmount(sub, user.balance);

      if (!bet || bet <= 0) return { error: '❌ Podaj poprawną kwotę wpisowego (stawki).' };
      if (bet > user.balance) return { error: '❌ Brak wystarczających środków w portfelu na pokrycie wpisowego.' };

      user.balance -= bet;
      return { success: true, bet };
    });

    if (betResult.error) {
      await message.reply(betResult.error).catch(() => null);
      return;
    }

    const newSession = {
      state: 'lobby',
      threadId,
      hostId: message.author.id,
      bet: betResult.bet,
      participants: [message.author.id],
      timestamp: Date.now(),
      lobbyDuration: 90000 // 90 seconds
    };

    client.warSessions.set(threadId, newSession);
    saveGameSessions(client);

    await message.reply(
      `🎴 **ROZPOCZĘTO ZAPISY DO WOJNY KARCIANEJ!** 🎴\n` +
      `**${message.author.username || 'Host'}** utworzył rozgrywkę!\n\n` +
      `💰 Wpisowe: **${formatCurrency(betResult.bet)}**\n` +
      `⏱️ Czas na zapisy: **90 sekund**\n` +
      `👥 Maksymalnie: **12 graczy**\n\n` +
      `👉 Wpisz **!wojna dolacz** (lub **!wojna d**), aby wejść do gry!`
    ).catch(() => null);

    // Setup lobby resolution
    setTimeout(async () => {
      await module.exports.resumeLobby(client, threadId);
    }, newSession.lobbyDuration);
  }
};

async function resumeLobby(client, threadId) {
  const active = client.warSessions.get(threadId);
  if (!active || active.state !== 'lobby') return;

  if (active.participants.length < 2) {
    const { withData, createUser } = require('../utils/storage');
    await withData(store => {
      const hostUser = createUser(active.hostId, store.users);
      hostUser.balance += active.bet;
    });

    client.warSessions.delete(threadId);
    saveGameSessions(client);

    if (client.api) {
      const { formatCurrency } = require('../utils/economy');
      await client.api.sendMessage(
        `❌ Wojna karciana została anulowana – zgłosiło się za mało uczestników (wymagane min. 2 osoby, zapisał się tylko host).\n` +
        `💰 Stawka **${formatCurrency(active.bet)}** została zwrócona do portfela hosta.`,
        threadId
      ).catch(() => null);
    }
    return;
  }

  active.state = 'game';
  saveGameSessions(client);

  let players = [...active.participants];
  const allParticipants = [...players];
  const pot = allParticipants.length * active.bet;
  let roundNum = 1;

  const runTurn = async () => {
    try {
      if (players.length <= 1) {
        const winnerId = players[0];
        const winnerName = await client.resolveUserName(winnerId);

        const tax = Math.floor(pot * 0.05);
        const potAfterTax = pot - tax;

        const { withData, createUser } = require('../utils/storage');
        const { ensureInventoryRecord, recordGame, refreshBadges, getRandomXp, formatCurrency } = require('../utils/economy');
        const { advanceChallenge } = require('../utils/challenges');

        const resolution = await withData(store => {
          const winnerUser = createUser(winnerId, store.users);
          const winnerInv = ensureInventoryRecord(store.inventory, winnerId);
          const { hasItem } = require('../utils/economy');
          let finalPot = potAfterTax;
          if (hasItem(winnerInv, 'krolewskie_insygnia')) {
            const profit = potAfterTax - active.bet;
            if (profit > 0) {
              finalPot += Math.floor(profit * 0.10);
            }
          }
          winnerUser.balance += finalPot;

          const net = finalPot - active.bet;
          const xpResult = recordGame(winnerUser, net, getRandomXp(), winnerInv);
          refreshBadges(winnerUser, winnerInv);
          advanceChallenge(winnerId, store, 'wojna_streak', 1, { betAmount: active.bet, won: true });

          const losersXp = [];
          for (const pid of allParticipants) {
            if (pid !== winnerId) {
              const loserUser = createUser(pid, store.users);
              const loserInv = ensureInventoryRecord(store.inventory, pid);
              const lx = recordGame(loserUser, -active.bet, getRandomXp(), loserInv);
              refreshBadges(loserUser, loserInv);
              losersXp.push({ userId: pid, xpResult: lx });
            }
          }

          return { xpResult, losersXp };
        });

        client.warSessions.delete(threadId);
        saveGameSessions(client);

        let winMsg = `🏆 **WOJNA ZAKOŃCZONA!** 🏆\n\n` +
          `👑 Zwycięzcą zostaje: **${winnerName}**!\n` +
          `💰 Wygrana pula: **+${formatCurrency(potAfterTax)}** (netto: +${formatCurrency(potAfterTax - active.bet)}, po potrąceniu 5% podatku: -${formatCurrency(tax)})\n`;

        if (resolution.xpResult && resolution.xpResult.leveledUp) {
          winMsg += `\n🎉 **AWANS!** ${winnerName} awansował na **poziom ${resolution.xpResult.newLevel}**!`;
          if (resolution.xpResult.milestonesGained && resolution.xpResult.milestonesGained.length > 0) {
            const { getMilestoneRewardDescription } = require('../utils/economy');
            for (const lvl of resolution.xpResult.milestonesGained) {
              winMsg += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
            }
          }
        }

        for (const lx of resolution.losersXp) {
          if (lx.xpResult && lx.xpResult.leveledUp) {
            const lName = await client.resolveUserName(lx.userId);
            winMsg += `\n🎉 **AWANS!** ${lName} awansował na **poziom ${lx.xpResult.newLevel}**!`;
          }
        }

        if (client.api) {
          await client.api.sendMessage(winMsg, threadId).catch(() => null);
        }
        return;
      }

      const draws = [];
      const crypto = require('crypto');
      for (const pid of players) {
        const val = crypto.randomInt(2, 15);
        const suit = crypto.randomInt(1, 5);
        const strength = val * 10 + suit;
        draws.push({ userId: pid, val, suit, strength });
      }

      draws.sort((a, b) => a.strength - b.strength);

      const N = players.length;
      const E = Math.max(1, Math.min(N - 1, Math.round(N * 0.40)));

      const eliminated = draws.slice(0, E);
      const survivors = draws.slice(E);

      let roundMsg = `🎴 **WOJNA - RUNDA ${roundNum}** 🎴\n` +
        `Pozostało graczy: **${N}**\n\n` +
        `**Wylosowane karty:**\n`;

      const CARD_NAMES = {
        2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
        11: 'Walet (J)', 12: 'Dama (Q)', 13: 'Król (K)', 14: 'As (A)'
      };

      const SUIT_EMOJIS = {
        4: '♠️ Pik',
        3: '♥️ Kier',
        2: '♦️ Karo',
        1: '♣️ Trefl'
      };

      for (const draw of draws) {
        const name = await client.resolveUserName(draw.userId);
        const cardStr = `${CARD_NAMES[draw.val]} ${SUIT_EMOJIS[draw.suit]}`;
        const isElim = eliminated.some(el => el.userId === draw.userId);
        roundMsg += `• **${name}**: ${cardStr} ${isElim ? '❌ (Odpada)' : '✅'}\n`;
      }

      roundNum++;
      players = survivors.map(s => s.userId);

      if (client.api) {
        await client.api.sendMessage(roundMsg, threadId).catch(() => null);
      }

      setTimeout(runTurn, 4000);
    } catch (err) {
      console.error('[WOJNA] Błąd w trakcie tury:', err);
      if (client.api) {
        await client.api.sendMessage('❌ Wojna karciana: wystąpił błąd podczas rozgrywki.', threadId).catch(() => null);
      }
    }
  };

  if (client.api) {
    const { formatCurrency } = require('../utils/economy');
    await client.api.sendMessage(
      `🏁 **ZAPISY ZAMKNIĘTE! ROZPOCZYNAMY WOJNĘ!** 🏁\n` +
      `Uczestnicy (**${allParticipants.length}**): Wszyscy wkraczają na pole walki.\n` +
      `Pula nagród: **${formatCurrency(pot)}**\n\n` +
      `Losowanie za 3 sekundy...`,
      threadId
    ).catch(() => null);
  }

  setTimeout(runTurn, 3000);
}
