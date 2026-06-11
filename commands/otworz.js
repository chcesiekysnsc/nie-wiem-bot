const { formatCurrency, randomInt, addItem, removeItem, hasItem, ensureInventoryRecord, getItemQuantity } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

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
    minCash: 22500,
    maxCash: 72500,
    drops: [
      { chance: 100, items: [{ id: 'ticket', qty: 1, label: '🎟️ Bilet Loterii' }] } // 10% = 100/1000
    ]
  },
  srebrna: {
    id: 'paczka_srebrna',
    name: 'Srebrna Paczka',
    emoji: '⬜',
    minCash: 71250,
    maxCash: 146250,
    drops: [
      { chance: 50, items: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }] }, // 5% = 50/1000
      { chance: 50, items: [{ id: 'piwo',   qty: 1, label: '🍺 Piwo'   }] }  // 5% = 50/1000
    ]
  },
  zlota: {
    id: 'paczka_zlota',
    name: 'Złota Paczka',
    emoji: '🟨',
    minCash: 145000,
    maxCash: 245000,
    drops: [
      { chance: 50, items: [{ id: 'bomba',  qty: 1, label: '💣 Bomba'  }] }, // 5% = 50/1000
      { chance: 30, items: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }, { id: 'piwo', qty: 1, label: '🍺 Piwo' }] }, // 3% = 30/1000
      { chance: 20, items: [{ id: 'ticket', qty: 1, label: '🎟️ Bilet Loterii' }] }, // 2% = 20/1000
      { chance: 20, items: [{ id: 'zlota_karta', qty: 1, label: '💳 Złota Karta' }] }, // 2% = 20/1000
      { chance: 10, items: [{ id: 'kamera', qty: 1, label: '📷 Kamera' }] } // 1% = 10/1000
    ]
  },
  diamentowa: {
    id: 'paczka_diamentowa',
    name: 'Diamentowa Paczka',
    emoji: '🟦',
    minCash: 225000,
    maxCash: 725000,
    drops: [
      { chance: 50, items: [{ id: 'vip',  qty: 1, label: '👑 VIP Pass',          permanent: true }] }, // 5% = 50/1000
      { chance: 50, items: [{ id: 'sejf', qty: 1, label: '🏦 Ulepszenie Banku',  permanent: true }] }, // 5% = 50/1000
      { chance: 20, items: [{ id: 'krwawy_zeton', qty: 1, label: '🩸 Krwawy Żeton' }] }, // 2% = 20/1000
      { chance: 5,  items: [{ id: 'stary_zegar', qty: 1, label: '⏰ Stary Zegar' }] }  // 0.5% = 5/1000
    ]
  },
  tytanowa: {
    id: 'paczka_tytanowa',
    name: 'Tytanowa Paczka',
    emoji: '🩶',
    minCash: 550000,
    maxCash: 1000000,
    drops: [
      { chance: 20, items: [{ id: 'przekupiony_krupier', qty: 1, label: '🧠 Przekupiony Krupier' }] }, // 2% = 20/1000
      { chance: 150, items: [{ id: 'bomba', qty: 1, label: '💣 Bomba' }] }, // 15% = 150/1000
      { chance: 150, items: [{ id: 'piwo',  qty: 1, label: '🍺 Piwo'  }] },  // 15% = 150/1000
      { chance: 100, items: [{ id: 'klodka', qty: 1, label: '🔒 Kłódka' }] } // 10% = 100/1000 (total for bomba/piwo/klodka = 40% = 400/1000)
    ]
  }
};

// Zamienniki gdy gracz już posiada dany permanent item
const FALLBACKS = {
  vip:  [{ id: 'klodka', qty: 2, label: '🔒 Kłódka x2' }, { id: 'piwo',  qty: 1, label: '🍺 Piwo'        }],
  sejf: [{ id: 'bomba',  qty: 1, label: '💣 Bomba'      }, { id: 'klodka', qty: 2, label: '🔒 Kłódka x2' }]
};

// Losuje drop na podstawie tabeli szans (1-1000)
function rollDrop(drops) {
  const roll = randomInt(1, 1000);
  let cumulative = 0;
  for (const drop of drops) {
    cumulative += drop.chance;
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
        `🟫 **Brązowa** (50k)    — 22 500 – 72 500 + 10% Bilet Loterii\n` +
        `⬜ **Srebrna** (100k)   — 71 250 – 146 250 + 10% Kłódka lub Piwo\n` +
        `🟨 **Złota** (200k)     — 145 000 – 245 000 + 10% szans: Bomba, Kłódka+Piwo, Bilet, 2% Złota Karta, 1% Kamera\n` +
        `🟦 **Diamentowa** (500k) — 225 000 – 725 000 + 10% szans: VIP, Sejf, 2% Krwawy Żeton, 0.5% Stary Zegar\n` +
        `🩶 **Tytanowa** (800k)   — 550 000 – 1 000 000 + 2% Przekupiony Krupier, 40% Bomba/Piwo/Kłódka\n\n` +
        `💡 Kup paczki w sklepie: **!sklep**`
      );
      return;
    }

    const pack = PACZKI[packKey];

    const countInput = String(args[1] || '').trim().toLowerCase();

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

        const drop = rollDrop(pack.drops);
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
