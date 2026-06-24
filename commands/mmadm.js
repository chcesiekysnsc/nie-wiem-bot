const { generateMatch } = require('./mecz');
const { formatCurrency } = require('../utils/economy');
const { simulateFullMatch } = require('../utils/bets');

module.exports = {
  name: 'mmadm',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    
    // Sprawdź czy to twórca
    if (message.author.id !== creatorId) {
      return; // Brak odpowiedzi dla nieuprawnionych
    }

    // Parser argumentów: !mmadm <ilosc_meczy> (ilosc_rund) [min/mid/max] {kwota}
    if (args.length < 4) {
      await message.reply('❌ Użycie: !mmadm <ilosc_meczy> <ilosc_rund> [min/mid/max] <kwota>\nPrzykład: !mmadm 5 20 max 1000');
      return;
    }

    const matchCount = parseInt(args[0], 10);
    const rounds = parseInt(args[1], 10);
    const autoType = args[2].toLowerCase();
    const stakeRaw = args[3];

    // Walidacja
    if (isNaN(matchCount) || matchCount < 1 || matchCount > 10) {
      await message.reply('❌ Liczba meczów musi być od 1 do 10.');
      return;
    }

    if (isNaN(rounds) || rounds < 1) {
      await message.reply('❌ Liczba rund musi być co najmniej 1.');
      return;
    }

    if (!['min', 'mid', 'max'].includes(autoType)) {
      await message.reply('❌ Tryb musi być min, mid lub max.');
      return;
    }

    const stake = parseInt(stakeRaw, 10);
    if (isNaN(stake) || stake <= 0) {
      await message.reply('❌ Podaj poprawną kwotę.');
      return;
    }

    await message.reply(`🎰 **Symulacja administracyjna multi-meczów**\n\n⚙️ Konfiguracja:\n• Ilość meczów: ${matchCount}\n• Ilość rund: ${rounds}\n• Tryb: ${autoType}\n• Stawka na mecz: ${formatCurrency(stake)}\n\n⏳ Trwa symulacja...`);

    let totalWins = 0;
    let totalLosses = 0;
    let totalNet = 0;
    let totalStake = 0;
    let totalPayout = 0;
    const roundResults = [];

    for (let round = 0; round < rounds; round++) {
      // Generuj mecze dla tej rundy
      const matches = [];
      for (let i = 0; i < matchCount; i++) {
        matches.push(generateMatch());
      }

      // Wybierz typy zakładów zgodnie z trybem
      const selections = [];
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const odds = match.odds;
        const oddsArray = [odds['1'], odds['x'], odds['2']];
        
        let selectedType;
        if (autoType === 'min') {
          const minOdds = Math.min(...oddsArray);
          selectedType = Object.keys(odds).find(key => odds[key] === minOdds);
        } else if (autoType === 'mid') {
          const sortedOdds = [...oddsArray].sort((a, b) => a - b);
          const midOdds = sortedOdds[1];
          selectedType = Object.keys(odds).find(key => odds[key] === midOdds);
        } else {
          const maxOdds = Math.max(...oddsArray);
          selectedType = Object.keys(odds).find(key => odds[key] === maxOdds);
        }
        
        selections.push({ matchIdx: i, type: selectedType, match });
      }

      // Symuluj mecze
      const simulations = selections.map(s => simulateFullMatch(s.match));

      // Oblicz wynik kuponu
      let combinedOdds = 1;
      let ticketWon = true;
      const matchResults = [];

      for (let i = 0; i < selections.length; i++) {
        const sel = selections[i];
        const match = sel.match;
        const sim = simulations[i];
        const odds = match.odds[sel.type];
        combinedOdds *= odds;
        
        const matchWon = sel.type === sim.outcome;
        if (!matchWon) {
          ticketWon = false;
        }
        
        matchResults.push({
          matchIdx: i,
          home: match.home,
          away: match.away,
          type: sel.type,
          odds,
          outcome: sim.outcome,
          matchWon,
          finalHomeGoals: sim.finalHomeGoals,
          finalAwayGoals: sim.finalAwayGoals
        });
      }

      combinedOdds = parseFloat(combinedOdds.toFixed(2));
      const roundStake = stake * matchCount;
      const potentialWin = Math.round(stake * combinedOdds);
      const tax = Math.round(potentialWin * 0.15);
      const payout = potentialWin - tax;

      let net = 0;
      if (ticketWon) {
        net = payout - roundStake;
        totalWins++;
      } else {
        net = -roundStake;
        totalLosses++;
      }

      totalNet += net;
      totalStake += roundStake;
      totalPayout += payout;

      roundResults.push({
        round: round + 1,
        ticketWon,
        combinedOdds,
        net,
        payout: ticketWon ? payout : 0,
        matchResults
      });
    }

    // Podsumowanie statystyk
    const winRate = ((totalWins / rounds) * 100).toFixed(2);
    const avgOdds = roundResults.reduce((sum, r) => sum + r.combinedOdds, 0) / rounds;
    const avgNet = totalNet / rounds;

    let summary = `📊 **WYNIKI SYMULACJI ADMINISTRACYJNEJ** 📊\n\n`;
    summary += `🎯 **Konfiguracja:**\n`;
    summary += `• Ilość meczów: ${matchCount}\n`;
    summary += `• Ilość rund: ${rounds}\n`;
    summary += `• Tryb: ${autoType}\n`;
    summary += `• Stawka na mecz: ${formatCurrency(stake)}\n\n`;

    summary += `📈 **Statystyki ogólne:**\n`;
    summary += `• Wygrane rundy: ${totalWins} (${winRate}%)\n`;
    summary += `• Przegrane rundy: ${totalLosses}\n`;
    summary += `• Średni kurs: ${avgOdds.toFixed(2)}\n`;
    summary += `• Całkowita stawka: ${formatCurrency(totalStake)}\n`;
    summary += `• Całkowita wypłata: ${formatCurrency(totalPayout)}\n`;
    summary += `• Całkowity bilans: ${totalNet >= 0 ? '+' : ''}${formatCurrency(totalNet)}\n`;
    summary += `• Średni bilans na rundę: ${avgNet >= 0 ? '+' : ''}${formatCurrency(avgNet)}\n\n`;

    // Pokaż szczegóły pierwszych 5 i ostatnich 5 rund
    const roundsToShow = roundResults.slice(0, 5);
    if (roundResults.length > 10) {
      roundsToShow.push(...roundResults.slice(-5));
    } else if (roundResults.length > 5) {
      roundsToShow.push(...roundResults.slice(5));
    }

    summary += `📋 **Szczegóły rund:**\n`;
    for (const result of roundsToShow) {
      const emoji = result.ticketWon ? '✅' : '❌';
      summary += `${emoji} Runda ${result.round}: Kurs ${result.combinedOdds} | Bilans ${result.net >= 0 ? '+' : ''}${formatCurrency(result.net)}\n`;
    }

    if (roundResults.length > 10) {
      summary += `... (${roundResults.length - 10} rund pominiętych) ...\n`;
    }

    await message.reply(summary);
  }
};
