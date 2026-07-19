const { formatCurrency, randomInt, addItem, removeItem, hasItem, ensureInventoryRecord, getItemQuantity, getActiveEventMultiplier } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveLuck } = require('../utils/chances');

// Normalizacja polskich liter z wejścia gracza
function normalizePack(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/ą/g, 'a').replace(/ę/g, 'e').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ł/g, 'l').replace(/ż/g, 'z')
    .replace(/ź/g, 'z').replace(/ć/g, 'c').replace(/ń/g, 'n')
    .trim();
}

// Definicje paczek (szanse podane w promilach, tj. na 1000, aby obsłużyć 0.5%)
const PACZKI = {
  brazowa: {
    id: 'paczka_brazowa',
    name: 'Brązowa Paczka',
    emoji: '🟫',
    minCash: 20250,
    maxCash: 65250,
    drops: [
      { chance: 100, items: [{ id: 'ticket', qty: 1, label: '🎟️ Bilet Loterii' }] }, // 10%
      { chance: 30,  items: [{ id: 'walizka', qty: 1, label: '💼 Walizka', permanent: true }] }, // 3%
      { chance: 40, items: [{ id: 'material_upgrade_1', qty: 1, label: '🔩 Żelazo' }] }, // 4%
      { chance: 20, items: [{ id: 'material_upgrade_2', qty: 1, label: '🔧 Miedź' }] } // 2%
    ]
  },
  srebrna: {
    id: 'paczka_srebrna',
    name: 'Srebrna Paczka',
    emoji: '⬜',
    minCash: 64125,
    maxCash: 131625,
    drops: [
      { chance: 50, items: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }] },
      { chance: 50, items: [{ id: 'piwo',   qty: 1, label: '🍺 Piwo'   }] },
      { chance: 25, items: [{ id: 'kominiarka', qty: 1, label: '🥷 Kominiarka', permanent: true }] }, // 2.5%
      { chance: 25, items: [{ id: 'podrecznik_praktykanta', qty: 1, label: '📘 Podręcznik Praktykanta', permanent: true }] }, // 2.5%
      { chance: 50, items: [{ id: 'material_upgrade_1', qty: 1, label: '🔩 Żelazo' }] },
      { chance: 30, items: [{ id: 'material_upgrade_2', qty: 1, label: '🔧 Miedź' }] },
      { chance: 15, items: [{ id: 'material_upgrade_3', qty: 1, label: '⚙️ Tytan' }] }
    ]
  },
  zlota: {
    id: 'paczka_zlota',
    name: 'Złota Paczka',
    emoji: '🟨',
    minCash: 130500,
    maxCash: 220500,
    drops: [
      { chance: 50, items: [{ id: 'bomba',  qty: 1, label: '💣 Bomba'  }] },
      { chance: 30, items: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }, { id: 'piwo', qty: 1, label: '🍺 Piwo' }] },
      { chance: 20, items: [{ id: 'ticket', qty: 1, label: '🎟️ Bilet Loterii' }] },
      { chance: 20, items: [{ id: 'zlota_karta', qty: 1, label: '💳 Złota Karta' }] },
      { chance: 10, items: [{ id: 'kamera', qty: 1, label: '📷 Kamera' }] },
      { chance: 10, items: [{ id: 'talizman_fortuny', qty: 1, label: '📿 Talizman Fortuny', permanent: true }] },
      { chance: 15, items: [{ id: 'zestaw_wlamywacza', qty: 1, label: '🛠️ Zestaw Włamywacza', permanent: true }] }, // 1.5%
      { chance: 15, items: [{ id: 'latarka', qty: 1, label: '🔦 Latarka', permanent: true }] }, // 1.5%
      { chance: 10, items: [{ id: 'ksiega_inwestora', qty: 1, label: '📖 Księga Inwestora', permanent: true }] }, // 1.0%
      { chance: 40, items: [{ id: 'material_upgrade_2', qty: 1, label: '🔧 Miedź' }] },
      { chance: 30, items: [{ id: 'material_upgrade_3', qty: 1, label: '⚙️ Tytan' }] },
      { chance: 10, items: [{ id: 'material_upgrade_4', qty: 1, label: '💎 Karbid' }] }
    ]
  },
  diamentowa: {
    id: 'paczka_diamentowa',
    name: 'Diamentowa Paczka',
    emoji: '🟦',
    minCash: 202500,
    maxCash: 652500,
    drops: [
      { chance: 50, items: [{ id: 'vip',  qty: 1, label: '👑 VIP Pass',          permanent: true }] },
      { chance: 50, items: [{ id: 'sejf', qty: 1, label: '🏦 Ulepszenie Banku',  permanent: true }] },
      { chance: 20, items: [{ id: 'krwawy_zeton', qty: 1, label: '🩸 Krwawy Żeton' }] },
      { chance: 5,  items: [{ id: 'stary_zegar', qty: 1, label: '⏰ Stary Zegar' }] },
      { chance: 30, items: [{ id: 'godlo_gangu', qty: 1, label: '🛡️ Godło Gangu', permanent: true }] },
      { chance: 30, items: [{ id: 'garnitur', qty: 1, label: '👔 Garnitur', permanent: true }] },
      { chance: 20, items: [{ id: 'alarm', qty: 1, label: '🚨 Alarm', permanent: true }] }, // 2.0%
      { chance: 20, items: [{ id: 'pies_strozujacy', qty: 1, label: '🐕 Pies Stróżujący', permanent: true }] }, // 2.0%
      { chance: 15, items: [{ id: 'kaczka_biznesu', qty: 1, label: '🦆 Kaczka Biznesu', permanent: true }] }, // 1.5%
      { chance: 15, items: [{ id: 'patrol_policji', qty: 1, label: '🚔 Patrol Policji', permanent: true }] }, // 1.5%
      { chance: 10, items: [{ id: 'mocna_kawa', qty: 1, label: '☕ Mocna Kawa', permanent: true }] }, // 1.0%
      { chance: 50, items: [{ id: 'material_upgrade_3', qty: 1, label: '⚙️ Tytan' }] },
      { chance: 30, items: [{ id: 'material_upgrade_4', qty: 1, label: '💎 Karbid' }] },
      { chance: 10, items: [{ id: 'material_upgrade_5', qty: 1, label: '⚛️ Inżelit' }] }
    ]
  },
  tytanowa: {
    id: 'paczka_tytanowa',
    name: 'Tytanowa Paczka',
    emoji: '🩶',
    minCash: 495000,
    maxCash: 900000,
    drops: [
      { chance: 20, items: [{ id: 'przekupiony_krupier', qty: 1, label: '🧠 Przekupiony Krupier' }] },
      { chance: 150, items: [{ id: 'bomba', qty: 1, label: '💣 Bomba' }] },
      { chance: 150, items: [{ id: 'piwo',  qty: 1, label: '🍺 Piwo'  }] },
      { chance: 100, items: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }] },
      { chance: 30, items: [{ id: 'kosc_ryzyka', qty: 1, label: '🎲 Kostka Ryzyka', permanent: true }] },
      { chance: 30, items: [{ id: 'insygnia_gang', qty: 1, label: '🏴‍☠️ Insygnia Gangu', permanent: true }] }, // 3.0%
      { chance: 7.5, items: [{ id: 'dobra_ksiegowa', qty: 1, label: '👩‍💼 Dobra Księgowa', permanent: true }] }, // 0.75%
      { chance: 15, items: [{ id: 'odznaka_komendanta', qty: 1, label: '🎖️ Odznaka Komendanta', permanent: true }] }, // 1.5%
      { chance: 5, items: [{ id: 'klucz_wiezienny', qty: 1, label: '🔑 Klucz Więzienny' }] }, // 0.5%
      { chance: 7.5, items: [{ id: 'sakiewka_kolekcjonera', qty: 1, label: '💰 Sakiewka Kolekcjonera', permanent: true }] }, // 0.75%
      { chance: 10, items: [{ id: 'z_drive', qty: 1, label: '⏳ Z-drive', permanent: true }] }, // 1.0%
      { chance: 10, items: [{ id: 'rekawice_robotnika', qty: 1, label: '🧤 Rękawice Robotnika', permanent: true }] }, // 1.0%
      { chance: 120, items: [{ id: 'material_upgrade_4', qty: 1, label: '💎 Karbid' }] },
      { chance: 80, items: [{ id: 'material_upgrade_5', qty: 1, label: '⚛️ Inżelit' }] }
    ]
  }
};

// Zamienniki gdy gracz już posiada dany permanent item
const FALLBACKS = {
  vip:              [{ id: 'klodka', qty: 2, label: '🔒 Kłódka x2' }, { id: 'piwo',  qty: 1, label: '🍺 Piwo'        }],
  sejf:             [{ id: 'bomba',  qty: 1, label: '💣 Bomba'      }, { id: 'klodka', qty: 2, label: '🔒 Kłódka x2' }],
  talizman_fortuny: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }, { id: 'piwo', qty: 1, label: '🍺 Piwo' }],
  godlo_gangu:      [{ id: 'bomba', qty: 1, label: '💣 Bomba' }, { id: 'klodka', qty: 1, label: '🔒 Kłódka' }],
  garnitur:         [{ id: 'bomba', qty: 1, label: '💣 Bomba' }, { id: 'piwo', qty: 1, label: '🍺 Piwo' }],
  kosc_ryzyka:      [{ id: 'bomba', qty: 2, label: '💣 Bomba x2' }],
  walizka:          [{ id: 'ticket', qty: 2, label: '🎟️ Bilet Loterii x2' }],
  podrecznik_praktykanta: [{ id: 'piwo', qty: 1, label: '🍺 Piwo' }],
  kominiarka:       [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }],
  zestaw_wlamywacza: [{ id: 'bomba', qty: 1, label: '💣 Bomba' }],
  latarka:          [{ id: 'piwo', qty: 1, label: '🍺 Piwo' }],
  ksiega_inwestora: [{ id: 'klodka', qty: 2, label: '🔒 Kłódka x2' }],
  alarm:            [{ id: 'bomba', qty: 2, label: '💣 Bomba x2' }],
  pies_strozujacy:  [{ id: 'klodka', qty: 2, label: '🔒 Kłódka x2' }],
  kaczka_biznesu:   [{ id: 'bomba', qty: 1, label: '💣 Bomba' }, { id: 'piwo', qty: 1, label: '🍺 Piwo' }],
  insygnia_gang:    [{ id: 'bomba', qty: 2, label: '💣 Bomba x2' }],
  dobra_ksiegowa:   [{ id: 'bomba', qty: 2, label: '💣 Bomba x2' }],
  odznaka_komendanta: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }],
  sakiewka_kolekcjonera: [{ id: 'bomba', qty: 1, label: '💣 Bomba' }, { id: 'piwo', qty: 1, label: '🍺 Piwo' }],
  z_drive: [{ id: 'klodka', qty: 2, label: '🔒 Kłódka x2' }],
  rekawice_robotnika: [{ id: 'piwo', qty: 1, label: '🍺 Piwo' }],
  patrol_policji: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }],
  mocna_kawa: [{ id: 'bomba', qty: 1, label: '💣 Bomba' }]
};

// Losuje drop na podstawie tabeli szans (1-1000)
function rollDrop(drops, luckMultiplier = 1) {
  const evMul = getActiveEventMultiplier('items');
  const roll = randomInt(1, 1000);
  let cumulative = 0;
  for (const drop of drops) {
    const chance = evMul > 1 ? Math.round(drop.chance * evMul) : drop.chance;
    const adjustedChance = luckMultiplier !== 1 ? Math.round(chance * luckMultiplier) : chance;
    cumulative += adjustedChance;
    if (roll <= cumulative) return drop;
  }
  return null; // brak dropu
}

module.exports = {
  name: 'otworz',
  aliases: ['open', 'otwórz', 'paczka'],
  async execute(client, message, args) {
    const input = normalizePack(args[0]);

    // Mapa przyjaznych wariantów wpisywanych przez graczy
    let packKey = null;
    if (['brazowa', 'braz', 'bronze', 'bron'].includes(input))          packKey = 'brazowa';
    else if (['srebrna', 'srebr', 'silver', 'silv'].includes(input))    packKey = 'srebrna';
    else if (['zlota', 'zlo', 'gold'].includes(input))                  packKey = 'zlota';
    else if (['diamentowa', 'diament', 'diamo', 'diamond', 'dia'].includes(input)) packKey = 'diamentowa';
    else if (['tytanowa', 'tytan', 'titanium', 'titan', 't'].includes(input)) packKey = 'tytanowa';

    if (!packKey) {
      await message.reply(
        `📦 **System Paczek**\n` +
        `Użyj: **!otworz <brazowa|srebrna|zlota|diamentowa|tytanowa>**\n\n` +
        `🟫 **Brązowa** (50k)    — 20 250 – 65 250 + 10% Bilet Loterii\n` +
        `⬜ **Srebrna** (100k)   — 64 125 – 131 625 + 10% Kłódka lub Piwo\n` +
        `🟨 **Złota** (200k)     — 130 500 – 220 500 + 10% szans: Bomba, Kłódka+Piwo, Bilet, 2% Złota Karta, 1% Kamera, 1% Talizman Fortuny\n` +
        `🟦 **Diamentowa** (500k) — 202 500 – 652 500 + 10% szans: VIP, Sejf, 2% Krwawy Żeton, 0.5% Stary Zegar, 3% Godło Gangu, 3% Garnitur\n` +
        `🩶 **Tytanowa** (800k)   — 495 000 – 900 000 + 2% Przekupiony Krupier, 3% Kostka Ryzyka, 0.75% Dobra Księgowa, 40% Bomba/Piwo/Kłódka\n\n` +
        `💡 Kup paczki w sklepie: **!sklep**`
      );
      return;
    }

    const pack = PACZKI[packKey];

    const countInput = String(args[1] || '').trim().toLowerCase();

    const boxDropLuckOverride = await getEffectiveLuck(message.author.id, 'box_drop_luck');
    const dropLuck = Number.isFinite(boxDropLuckOverride) ? boxDropLuckOverride : 1;

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);

      const ownedQty = getItemQuantity(inventory, pack.id);
      if (ownedQty <= 0) {
        return { error: `❌ Nie masz żadnej **${pack.emoji} ${pack.name}** w ekwipunku.\n💡 Kup ją w sklepie: **!sklep**` };
      }

      let count = 1;
      if (countInput === 'all' || countInput === 'max') {
        count = ownedQty;
      } else if (countInput) {
        count = parseInt(countInput, 10);
        if (isNaN(count) || count <= 0) {
          return { error: `❌ Podaj poprawną liczbę paczek do otwarcia (np. *!otworz ${packKey} 5* lub *!otworz ${packKey} all*).` };
        }
        if (count > ownedQty) {
          return { error: `❌ Posiadasz tylko **${ownedQty}x** ${pack.emoji} ${pack.name} (chcesz otworzyć: ${count}).` };
        }
      }

      // Limit otwierania: max 10 paczek łącznie na dzień
      const todayStr = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
      if (user.lastPackageOpenDate !== todayStr) {
        user.lastPackageOpenDate = todayStr;
        user.openedPackagesToday = 0;
      }

      const openedToday = user.openedPackagesToday || 0;
      const limit = 10;
      const remaining = limit - openedToday;

      if (remaining <= 0) {
        return { error: `❌ Osiągnąłeś już dzisiejszy limit otwarcia paczek (maksymalnie **${limit}** paczek łącznie na dzień). Kolejne paczki możesz otworzyć jutro!` };
      }

      if (count > remaining) {
        return { error: `❌ Dzisiaj możesz otworzyć jeszcze tylko **${remaining}** paczek (chcesz otworzyć: ${count}, dzisiaj otworzyłeś już: ${openedToday}/${limit}).` };
      }

      user.openedPackagesToday = openedToday + count;

      // Zdejmij paczki z ekwipunku
      removeItem(inventory, pack.id, count);

      let totalCash = 0;
      const itemsSummary = {};
      let fallbackCount = 0;

      for (let i = 0; i < count; i++) {
        const cash = randomInt(pack.minCash, pack.maxCash);
        totalCash += cash;

        const drop = rollDrop(pack.drops, dropLuck !== 1 ? dropLuck : 1);
        if (drop) {
          for (const item of drop.items) {
            if (item.permanent && hasItem(inventory, item.id)) {
              const fallback = FALLBACKS[item.id] || [];
              for (const fb of fallback) {
                addItem(inventory, fb.id, fb.qty);
                const labelName = fb.label.includes(' x') ? fb.label.split(' x')[0] : fb.label;
                if (!itemsSummary[fb.id]) {
                  itemsSummary[fb.id] = { label: labelName, qty: 0 };
                }
                itemsSummary[fb.id].qty += fb.qty;
              }
              fallbackCount++;
            } else {
              addItem(inventory, item.id, item.qty);
              const labelName = item.label;
              if (!itemsSummary[item.id]) {
                itemsSummary[item.id] = { label: labelName, qty: 0 };
              }
              itemsSummary[item.id].qty += item.qty;
            }
          }
        }
      }

      user.balance = (user.balance || 0) + totalCash;

      return { count, totalCash, balance: user.balance, itemsSummary, fallbackCount, openedPackagesToday: user.openedPackagesToday };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const droppedItems = Object.values(result.itemsSummary);

    if (result.count === 1) {
      let dropLine;
      if (droppedItems.length > 0) {
        const itemsStr = droppedItems.map(item => `${item.label}${item.qty > 1 ? ` x${item.qty}` : ''}`).join(' + ');
        if (result.fallbackCount > 0) {
          dropLine = `🔄 **BONUS DROP** (zamiennik — masz już ten przedmiot): ${itemsStr}`;
        } else {
          dropLine = `🎁 **BONUS DROP!** Otrzymujesz: ${itemsStr}`;
        }
      } else {
        dropLine = `💨 *Brak dodatkowego dropu tym razem...*`;
      }

      if (result.itemsSummary['kosc_ryzyka'] && result.fallbackCount === 0) {
        dropLine += `\n\n🎲 **Kostka Ryzyka:** Odblokowałeś nową komendę **!kosc**! Pozwala ona raz na 24h zaryzykować ostatnią wygraną z kasyna (do 500k) w rzucie 50/50.`;
      }

      await message.reply(
        `${pack.emoji} **OTWIERANIE — ${pack.name.toUpperCase()}**\n` +
        `🔑 Wkładanie klucza...\n` +
        `🔓 *Skrzynia się otwiera...*\n\n` +
        `✨ **BUM!** ✨\n` +
        `💰 Wygrałeś: **${formatCurrency(result.totalCash)}**!\n` +
        `${dropLine}\n\n` +
        `📅 Limit otwierania na dziś: **${result.openedPackagesToday}/10**\n` +
        `👛 Portfel: **${formatCurrency(result.balance)}**`
      );
    } else {
      let dropLine;
      if (droppedItems.length > 0) {
        const itemsList = droppedItems.map(item => `  • ${item.label} x${item.qty}`).join('\n');
        dropLine = `🎁 **Zsumowany bonus drop:**\n${itemsList}`;
        if (result.fallbackCount > 0) {
          dropLine += `\n🔄 *(w tym ${result.fallbackCount}x zamiennik za posiadane przedmioty)*`;
        }
      } else {
        dropLine = `💨 *Brak dodatkowych dropów z tych paczek...*`;
      }

      if (result.itemsSummary['kosc_ryzyka'] && result.fallbackCount === 0) {
        dropLine += `\n\n🎲 **Kostka Ryzyka:** Odblokowałeś nową komendę **!kosc**! Pozwala ona raz na 24h zaryzykować ostatnią wygraną z kasyna (do 500k) w rzucie 50/50.`;
      }

      await message.reply(
        `${pack.emoji} **MASOWE OTWIERANIE — ${result.count}x ${pack.name.toUpperCase()}**\n` +
        `🔑 Wkładanie kluczy do ${result.count} skrzyń...\n` +
        `🔓 *Skrzynie się otwierają...*\n\n` +
        `✨ **PODSUMOWANIE OTWARCIA** ✨\n` +
        `💰 Łączna wygrana gotówka: **+${formatCurrency(result.totalCash)}**!\n\n` +
        `${dropLine}\n\n` +
        `📅 Limit otwierania na dziś: **${result.openedPackagesToday}/10**\n` +
        `👛 Portfel: **${formatCurrency(result.balance)}**`
      );
    }
  }
};
