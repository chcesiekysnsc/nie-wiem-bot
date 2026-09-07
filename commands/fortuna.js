const config = require('../config/config');
const {
  formatCurrency,
  msToReadable,
  addItem,
  ensureInventoryRecord,
  getPolishFortunaReset,
  cleanupExpiredTempItems
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { eventItems } = require('./eventitemy');

// List of non-event permanent/passive item IDs suitable for 24h trial reward
const NON_EVENT_ITEM_IDS = [
  'vip', 'sejf', 'stary_zegar', 'z_drive', 'walizka', 'kamera', 'garnitur',
  'godlo_gangu', 'dobra_ksiegowa', 'sakiewka_kolekcjonera', 'rekawice_robotnika',
  'mocna_kawa', 'sportowe_auto', 'zaparzacz_espresso', 'kapelusz_magika',
  'platynowa_karta_kredytowa', 'konsultant', 'mentor', 'ksiazka_madnosci',
  'szybka_nauka', 'karta_vip', 'przekupiony_krupier', 'zlota_karta',
  'talizman_fortuny', 'kosc_ryzyka', 'kostka_losu', 'magiczna_sakiewka',
  'odznaka_komendanta', 'radar_policyjny', 'kurs_kwalifikacji',
  'kaczka_biznesu', 'terminal_gieldowy', 'kalkulator_finansowy',
  'certyfikat_inwestora', 'nowe_abibasy', 'falszer', 'karty_tarota'
];

// 10 Outcomes with explicit weights summing to 1000 (100.0%)
// Prize 10 (1 000 000 VC) has exactly 0.5% (weight 5/1000 = 0.005)
const PRIZES = [
  {
    id: 1,
    name: '25 000 VC',
    emoji: '💵',
    weight: 200, // 20.0%
    chanceLabel: '20%'
  },
  {
    id: 2,
    name: '50 000 VC',
    emoji: '💰',
    weight: 140, // 14.0%
    chanceLabel: '14%'
  },
  {
    id: 3,
    name: '100 000 VC',
    emoji: '💎',
    weight: 60, // 6.0%
    chanceLabel: '6%'
  },
  {
    id: 4,
    name: '+2 pytania do !analiza (24h)',
    emoji: '🧠',
    weight: 80, // 8.0%
    chanceLabel: '8%'
  },
  {
    id: 5,
    name: 'Ponowny spin + 20 000 VC',
    emoji: '🔄',
    weight: 75, // 7.5%
    chanceLabel: '7.5%'
  },
  {
    id: 6,
    name: 'Losowy Item na 24h (nie-eventowy)',
    emoji: '🎁',
    weight: 70, // 7.0%
    chanceLabel: '7%'
  },
  {
    id: 7,
    name: 'Pudło (Nic)',
    emoji: '💨',
    weight: 150, // 15.0%
    chanceLabel: '15%'
  },
  {
    id: 8,
    name: '+25% do work jednorazowo',
    emoji: '💼',
    weight: 120, // 12.0%
    chanceLabel: '12%'
  },
  {
    id: 9,
    name: '% salda gracza (6% / 3% / 2%)',
    emoji: '📈',
    weight: 100, // 10.0%
    chanceLabel: '10%'
  },
  {
    id: 10,
    name: '1 000 000 VC (JACKPOT!)',
    emoji: '🏆',
    weight: 5, // Dokładnie 0.5%
    chanceLabel: '0.5%'
  }
];

function drawPrize() {
  const totalWeight = PRIZES.reduce((acc, p) => acc + p.weight, 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (const prize of PRIZES) {
    cumulative += prize.weight;
    if (roll < cumulative) {
      return prize;
    }
  }
  return PRIZES[0];
}

module.exports = {
  name: 'fortuna',
  aliases: ['kolo', 'kolofortuny', 'wheel'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const now = Date.now();
    const sub = String(args[0] || '').toLowerCase().trim();

    // Podgląd nagród: !fortuna dropy / !fortuna info / !fortuna szanse
    if (['dropy', 'info', 'szanse', 'pomoc', 'help'].includes(sub)) {
      let infoMsg =
        `╔══════════════════════════════════════╗\n` +
        `║       🎡 NAGRODY KOŁA FORTUNY       ║\n` +
        `╚══════════════════════════════════════╝\n\n` +
        `Możesz zakręcić kołem **raz na 24h** (reset codziennie o **08:00 rano**).\n` +
        `Wymagane jest użycie co najmniej **25 komend** bota.\n\n` +
        `📋 **Tabela nagród i szanse na drop:**\n` +
        `1. 💵 **25 000 VC** — 20%\n` +
        `2. 💰 **50 000 VC** — 14%\n` +
        `3. 💎 **100 000 VC** — 6%\n` +
        `4. 🧠 **+2 pytania do !analiza na 24h** — 8%\n` +
        `5. 🔄 **Ponowny spin kołem + 20 000 VC** — 7.5%\n` +
        `6. 🎁 **Losowy Item na 24h** (nie-eventowy) — 7%\n` +
        `7. 💨 **Nic (pudło)** — 15%\n` +
        `8. 💼 **+25% do wypłaty z !work** (jednorazowo) — 12%\n` +
        `9. 📈 **% salda gracza** (<500k: 6%, 500k-2M: 3%, >2M: 2%) — 10%\n` +
        `10. 🏆 **1 000 000 VC** — 0.5% (JACKPOT!)\n\n` +
        `💡 *Wpisz \`!fortuna\` aby zakręcić kołem!*`;
      await message.reply(infoMsg);
      return;
    }

    const result = await withData(store => {
      cleanupExpiredTempItems(store, now);

      const user = createUser(userId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, userId);

      // 1. Sprawdzenie wymagania 25 komend
      const totalCmds = Math.max(
        Number(user.commandsUsed) || 0,
        Object.values(user.commandCounts || {}).reduce((s, v) => s + (Number(v) || 0), 0)
      );

      if (totalCmds < 25) {
        return {
          error: `❌ (za mało używasz bota) — Aby zakręcić kołem fortuny, musisz użyć co najmniej 25 komend! (Twoje użycia: **${totalCmds}/25**)`
        };
      }

      // 2. Sprawdzenie darmowego spinu lub dziennego cooldownu (reset o 8:00 rano)
      const hasFreeSpin = user.fortunaFreeSpins && user.fortunaFreeSpins > 0;
      const { lastReset, nextReset } = getPolishFortunaReset(now);

      if (!hasFreeSpin && user.lastFortunaClaim && user.lastFortunaClaim >= lastReset) {
        return {
          onCooldown: true,
          nextReset,
          msRemaining: nextReset - now
        };
      }

      // Zużycie darmowego spinu lub aktualizacja dziennego timestampu
      let usedFreeSpin = false;
      if (hasFreeSpin) {
        user.fortunaFreeSpins -= 1;
        usedFreeSpin = true;
      } else {
        user.lastFortunaClaim = now;
      }

      // 3. Losowanie nagrody
      const prize = drawPrize();
      let prizeDesc = '';
      let extraNote = '';

      switch (prize.id) {
        case 1: // 25k
          user.balance = (user.balance || 0) + 25000;
          prizeDesc = 'Na Twoje konto trafia **+25 000 VC**!';
          break;

        case 2: // 50k
          user.balance = (user.balance || 0) + 50000;
          prizeDesc = 'Na Twoje konto trafia **+50 000 VC**!';
          break;

        case 3: // 100k
          user.balance = (user.balance || 0) + 100000;
          prizeDesc = 'Wspaniała wygrana! Na Twoje konto trafia **+100 000 VC**!';
          break;

        case 4: // +2 pytania do !analiza na 24h
          user.analizaBonusUntil = Math.max(user.analizaBonusUntil || 0, now) + 24 * 3600 * 1000;
          prizeDesc = 'Przez najbliższe **24 godziny** Twój limit w **!analiza** jest zwiększony o **+2 dodatkowe zapytania**!';
          break;

        case 5: // Ponowny spin + 20k
          user.balance = (user.balance || 0) + 20000;
          user.fortunaFreeSpins = (user.fortunaFreeSpins || 0) + 1;
          prizeDesc = 'Wygrałeś **+20 000 VC** oraz **DARMOWY DODATKOWY SPIN**!';
          extraNote = '🎉 **Możesz zakręcić kołem ponownie już teraz!** Wpisz `!fortuna`!';
          break;

        case 6: { // Losowy item na 24h (nie-eventowy)
          // Wybieramy nieposiadany permanentny item, lub dowolny z listy
          const unowned = NON_EVENT_ITEM_IDS.filter(id => !inventory[id] || inventory[id] < 1);
          const pool = unowned.length > 0 ? unowned : NON_EVENT_ITEM_IDS;
          const chosenId = pool[Math.floor(Math.random() * pool.length)];
          const itemDef = config.shopItems[chosenId] || { name: chosenId, emoji: '📦' };

          addItem(inventory, chosenId, 1);
          store.profiles.tempItems = store.profiles.tempItems || [];
          store.profiles.tempItems.push({
            userId,
            itemId: chosenId,
            expiresAt: now + 24 * 3600 * 1000
          });

          prizeDesc = `Otrzymujesz przedmiot ${itemDef.emoji} **${itemDef.name}** na okres **24 godzin**! Przedmiot trafił do Twojego ekwipunku (\`!eq\`).`;
          break;
        }

        case 7: // Nic
          prizeDesc = 'Niestety, koło zatrzymało się na pustym polu. Nic nie wygrywasz!';
          break;

        case 8: // +25% do work jednorazowo
          user.fortunaWorkBonus = 0.25;
          prizeDesc = 'Zdobywasz **+25% bonusu** do wypłaty przy kolejnym użyciu komendy **!work**!';
          break;

        case 9: { // % salda gracza (poniżej 500k: 6%, 500k-2M: 3%, powyżej 2M: 2%)
          const bal = Math.max(0, user.balance || 0);
          let pct = 0.02;
          let pctLabel = '2%';
          if (bal < 500000) {
            pct = 0.06;
            pctLabel = '6%';
          } else if (bal <= 2000000) {
            pct = 0.03;
            pctLabel = '3%';
          }
          let pctAmount = Math.floor(bal * pct);
          if (pctAmount < 5000) pctAmount = 5000; // Minimalny gwarantowany bonus
          user.balance = bal + pctAmount;
          prizeDesc = `Twoje saldo zakwalifikowało Cię do mnożnika **${pctLabel}**! Otrzymujesz **+${formatCurrency(pctAmount)}**!`;
          break;
        }

        case 10: // 1 000 000 VC (0.5%)
          user.balance = (user.balance || 0) + 1000000;
          prizeDesc = '🌟 **MEGA JACKPOT (0.5% szansy)!** Wygrywasz zawrotny **1 000 000 VC**!';
          break;
      }

      return {
        prize,
        prizeDesc,
        extraNote,
        usedFreeSpin,
        balance: user.balance,
        nextReset: getPolishFortunaReset(now).nextReset
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    if (result.onCooldown) {
      await message.reply(
        `⏳ **Koło Fortuny kręci się raz na 24h (reset o 08:00 rano)!**\n\n` +
        `Już dziś odebrałeś swoje zakręcenie. Kolejny spin będzie gotowy za: **${msToReadable(result.msRemaining)}** (jutro o **08:00**).\n\n` +
        `💡 *Wpisz \`!fortuna dropy\` aby podejrzeć szanse i listę wszystkich nagród!*`
      );
      return;
    }

    const { prize, prizeDesc, extraNote, usedFreeSpin, balance, nextReset } = result;
    const msUntilNext = Math.max(0, nextReset - Date.now());

    let response =
      `╔══════════════════════════════════════╗\n` +
      `║        🎡 KOŁO FORTUNY 🎡          ║\n` +
      `╚══════════════════════════════════════╝\n\n` +
      `Koło zwalnia swój bieg... 🌀\n` +
      `Tyk... tyk... tyk... 🎯\n\n` +
      `         ▼ [ WYLOSOWANO ] ▼\n` +
      `✦────────────────────────────────────✦\n` +
      `   ${prize.emoji}  **${prize.name}**\n` +
      `✦────────────────────────────────────✦\n\n` +
      `${prizeDesc}\n`;

    if (extraNote) {
      response += `\n${extraNote}\n`;
    }

    response +=
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👛 Stan portfela: **${formatCurrency(balance)}**\n`;

    if (usedFreeSpin) {
      response += `ℹ️ *Wykorzystano darmowy spin! Regularny reset nastąpi o 08:00.*`;
    } else {
      response += `📅 Następne zakręcenie: jutro o 08:00 (za **${msToReadable(msUntilNext)}**)`;
    }

    await message.reply(response);
  }
};
