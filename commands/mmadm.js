const { generateMatch } = require('./mecz');
const { getAutoSelection } = require('./multiobstaw');
const { simulateFullMatch } = require('../utils/bets');
const { formatCurrency, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'mmadm',
  aliases: [],
  async execute(client, message, args) {
    const OWNER_ID = '100060812419294';
    if (message.author.id !== OWNER_ID) {
      return; // Silent return
    }

    if (args.length < 4) {
      await message.reply('❌ Użycie: !mmadm <ilosc_meczy (1-10)> <ilosc_rund (>0)> <min/mid/max> <kwota>');
      return;
    }

    const count = parseInt(args[0], 10);
    if (isNaN(count) || count < 1 || count > 10) {
      await message.reply('❌ Liczba meczów musi wynosić od 1 do 10.');
      return;
    }

    const rounds = parseInt(args[1], 10);
    if (isNaN(rounds) || rounds < 1) {
      await message.reply('❌ Liczba rund (symulacji) musi być większa od 0.');
      return;
    }

    const mode = String(args[2] || '').toLowerCase();
    if (!['min', 'mid', 'max'].includes(mode)) {
      await message.reply('❌ Wybierz tryb: min, mid lub max.');
      return;
    }

    const kwotaRaw = args[3];
    let resolvedKwota = null;
    let hasEnough = true;
    let totalStake = 0;

    await withData(store => {
      const u = createUser(OWNER_ID, store.users);
      resolvedKwota = resolveAmount(kwotaRaw, u.balance);
      if (resolvedKwota && resolvedKwota > 0) {
        totalStake = resolvedKwota * rounds;
        if (u.balance < totalStake) {
          hasEnough = false;
        } else {
          u.balance -= totalStake; // Pobranie całej stawki na start
        }
      }
    });

    if (!resolvedKwota || resolvedKwota <= 0) {
      await message.reply('❌ Podano niepoprawną kwotę.');
      return;
    }

    if (!hasEnough) {
      await message.reply(`❌ Nie masz wystarczających środków, aby puścić ${rounds} rund po ${formatCurrency(resolvedKwota)} (wymagane: ${formatCurrency(totalStake)}).`);
      return;
    }

    let wonRounds = 0;
    let lostRounds = 0;
    let wonMatches = 0;
    let lostMatches = 0;
    let totalGain = 0;
    let totalLoss = 0;
    let totalPayout = 0;
    
    // Zmienne do globalnego powiadomienia (zapamiętujemy najwyższy kurs z wygranych)
    let bestWonOdds = 0;
    let bestWonPayout = 0;

    for (let r = 0; r < rounds; r++) {
      const matches = [];
      for (let i = 0; i < count; i++) {
        matches.push(generateMatch());
      }

      let combinedOdds = 1;
      const selections = [];
      for (let i = 0; i < count; i++) {
        const match = matches[i];
        const selectedType = getAutoSelection(match, mode);
        const odds = match.odds[selectedType];
        combinedOdds *= odds;
        selections.push({ match, type: selectedType });
      }
      combinedOdds = parseFloat(combinedOdds.toFixed(2));

      let roundWon = true;
      for (const sel of selections) {
        const sim = simulateFullMatch(sel.match);
        const matchWon = (sel.type === sim.outcome);
        if (matchWon) {
          wonMatches++;
        } else {
          lostMatches++;
          roundWon = false;
        }
      }

      if (roundWon) {
        wonRounds++;
        const potentialWin = Math.round(resolvedKwota * combinedOdds);
        const tax = Math.round(potentialWin * 0.15);
        const payout = potentialWin - tax;
        const net = payout - resolvedKwota;
        
        totalGain += net;
        totalPayout += payout;
        
        if (combinedOdds > bestWonOdds) {
          bestWonOdds = combinedOdds;
          bestWonPayout = payout;
        }
      } else {
        lostRounds++;
        totalLoss += resolvedKwota;
      }
    }

    // Dodanie wygranych na konto admina po symulacji
    if (totalPayout > 0) {
      await withData(store => {
        const u = createUser(OWNER_ID, store.users);
        u.balance += totalPayout;
      });
    }

    const finalBalance = totalGain - totalLoss;
    const balanceSign = finalBalance >= 0 ? '+' : '-';

    const responseText = 
      `Wygrane rundy: ${wonRounds}\n` +
      `Przegrane rundy: ${lostRounds}\n\n` +
      `Wygrane mecze: ${wonMatches}\n` +
      `Przegrane mecze: ${lostMatches}\n\n` +
      `Łączny zysk: ${formatCurrency(totalGain)}\n` +
      `Łączna strata: ${formatCurrency(totalLoss)}\n\n` +
      `Bilans: ${balanceSign}${formatCurrency(Math.abs(finalBalance))}`;

    await message.reply(responseText);
    
    // Wysłanie globalnego powiadomienia, jeśli wygrano przynajmniej raz
    if (wonRounds > 0 && client.activeThreadIds) {
      const senderName = message.senderID === client.getCurrentUserID() ? 'Szef' : 'Szef (Admin)';
      const globalMsg = 
        `📢 GRUBY WYNIK Z ZAPLECZA! 📢\n` +
        `Użytkownik ${senderName} właśnie trafił na ukrytej komendzie admina!\n` +
        `Ilość trafionych kuponów (rund): ${wonRounds}\n` +
        `Najwyższy trafiony kurs (w zsumowaniu): ${bestWonOdds}\n` +
        `Najlepsza pojedyncza wygrana w rundzie: ${formatCurrency(bestWonPayout)}\n\n` +
        `Więc da się wygrywać... 🔥`;

      for (const threadId of client.activeThreadIds) {
        // Nie wysyłamy na ten sam czat, na którym admin odpalił komendę, żeby nie dublować spamu
        if (threadId !== message.threadID) {
          try {
            client.sendMessage(globalMsg, threadId);
          } catch (err) {}
        }
      }
    }
  }
};
