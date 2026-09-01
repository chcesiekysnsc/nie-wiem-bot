const config = require('../config/config');
const {
  addItem,
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  refreshBadges,
  getShopDiscount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

let count = 0;
const SHOP_ITEMS_ORDERED = Object.entries(config.shopItems)
  .filter(([id, item]) => item.buyable !== false)
  .map(([id, item]) => {
    return {
      num: ++count,
      id,
      ...item
    };
  });

const ALL_SHOP_ITEMS = Object.entries(config.shopItems).map(([id, item]) => {
  const shopEntry = SHOP_ITEMS_ORDERED.find(s => s.id === id);
  return {
    num: shopEntry ? shopEntry.num : null,
    id,
    ...item
  };
});

// Lista sklepu — krótkie opisy, paczki jako lootbox
function renderShopList(inventory) {
  const discount = getShopDiscount();
  const packKeys = {
    paczka_brazowa: 'brazowa',
    paczka_srebrna: 'srebrna',
    paczka_zlota: 'zlota',
    paczka_diamentowa: 'diamentowa',
    paczka_tytanowa: 'tytanowa',
    paczka_kosmiczna: 'kosmiczna'
  };

  return SHOP_ITEMS_ORDERED
    .map(item => {
      const isPackage = item.id.startsWith('paczka_');
      const desc = isPackage ? 'lootbox' : (item.shortDesc || item.description);
      const originalPrice = item.price;
      const discountedPrice = discount > 0 ? Math.max(0, Math.floor(originalPrice * (1 - discount / 100))) : originalPrice;
      const priceLabel = discount > 0
        ? `~~${formatCurrency(originalPrice)}~~ **${formatCurrency(discountedPrice)}** (-${discount}%)`
        : formatCurrency(originalPrice);
      const owned = inventory ? (inventory[item.id] || 0) : 0;
      const ownedLabel = owned > 0 ? ` (posiadasz: ${owned})` : '';

      let packOwnedLabel = '';
      if (isPackage && packKeys[item.id]) {
        try {
          const { PACZKI } = require('./otworz');
          const pack = PACZKI[packKeys[item.id]];
          if (pack && pack.drops) {
            const uniqueItemIds = [];
            for (const drop of pack.drops) {
              for (const it of drop.items) {
                if (!uniqueItemIds.includes(it.id)) {
                  uniqueItemIds.push(it.id);
                }
              }
            }
            const Y = uniqueItemIds.length;
            const X = inventory ? uniqueItemIds.filter(id => (inventory[id] || 0) > 0).length : 0;
            packOwnedLabel = ` (posiadasz ${X}/${Y})`;
          }
        } catch (_) {}
      }

      return `🛒 **${item.num}. ${item.emoji} ${item.name}** — ${priceLabel}${ownedLabel}\n_${desc}_${packOwnedLabel}`;
    })
    .join('\n');
}

module.exports = {
  name: 'sklep',
  aliases: ['shop', 'sklp', 'store'],
  async execute(client, message, args) {
    const firstArg = String(args[0] || '').toLowerCase();

    // !sklep help <nr> — szczegółowy opis itema
    if (firstArg === 'help' || firstArg === 'opis' || firstArg === 'info') {
      const targetNum = String(args[1] || '').toLowerCase();
      if (!targetNum) {
        await message.reply(
          `ℹ️ Użyj: **!sklep help <numer>** aby zobaczyć szczegółowy opis przedmiotu.\n` +
          `💡 Numery znajdziesz w liście sklepu: **!sklep**`
        );
        return;
      }

      const shopEntry = ALL_SHOP_ITEMS.find(i => i.num !== null && String(i.num) === targetNum)
        || ALL_SHOP_ITEMS.find(i => i.id === targetNum);

      if (!shopEntry) {
        await message.reply(`❌ Nie znaleziono przedmiotu o nazwie/numerze **${args[1]}**. Wpisz **!sklep** aby zobaczyć listę.`);
        return;
      }

      const item = config.shopItems[shopEntry.id];
      const typeLabel = item.type === 'permanent' ? '🔒 Jednorazowy (permanent)' : '📦 Stackable (wielokrotny)';
      const buyLabel  = item.buyable === false
        ? `❌ Niedostępny w sklepie — ${item.shopNote || 'tylko z paczek'}`
        : `✅ Dostępny w sklepie — kup: **!sklep ${shopEntry.num} [ilość]**`;
      const discount = getShopDiscount();
      const effectivePrice = Math.max(0, Math.floor(shopEntry.price * (1 - discount / 100)));
      const priceText = discount > 0
        ? `~~${formatCurrency(shopEntry.price)}~~ **${formatCurrency(effectivePrice)}** (-${discount}%)`
        : formatCurrency(shopEntry.price);

      await message.reply(
        `${shopEntry.emoji} **${shopEntry.name}** — ${priceText}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${item.description}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 Typ: ${typeLabel}\n` +
        `${buyLabel}`
      );
      return;
    }

    // !sklep (bez argumentów lub "list") — lista z krótkimi opisami
    if (!firstArg || firstArg === 'list') {
      const inventory = await withData(store => ensureInventoryRecord(store.inventory, message.author.id));
      const response =
        `🛒 **SKLEP KASYNOWY**\n` +
        `${renderShopList(inventory)}\n` +
        `💡 Kup: **!sklep <numer> [ilość]** | Szczegóły: **!sklep help <numer>**`;
      await message.reply(response);
      return;
    }

    // Obsługa zakupu
    let targetArg  = args[0];
    let quantityArg = args[1];

    if (firstArg === 'buy') {
      targetArg   = args[1];
      quantityArg = args[2];
    }

    const targetLower = String(targetArg || '').toLowerCase();
    const byNumber  = ALL_SHOP_ITEMS.find(i => i.num !== null && String(i.num) === targetLower);
    const shopEntry = byNumber || ALL_SHOP_ITEMS.find(i => i.id === targetLower);

    if (!shopEntry) {
      await message.reply(`❌ Nie znaleziono przedmiotu "${targetArg}". Sprawdź poprawny numer w sklepie lub wpisz **!sklep**.`);
      return;
    }

    const itemId = shopEntry.id;
    const item   = config.shopItems[itemId];

    if (item.buyable === false) {
      await message.reply(`❌ **${item.emoji} ${item.name}** nie jest dostępny w sklepie.\n💡 ${item.shopNote || 'Zdobądź go z paczki!'}`);
      return;
    }

    const parsedQuantity = Math.floor(Number(quantityArg || 1));
    const quantity = item.type === 'permanent' ? 1 : Math.max(1, isNaN(parsedQuantity) ? 1 : parsedQuantity);

    const result = await withData(store => {
      const user      = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const discount = getShopDiscount();
      const effectivePrice = Math.max(0, Math.floor(item.price * (1 - discount / 100)));

      if (item.type === 'permanent' && hasItem(inventory, itemId)) {
        return { error: '❌ Posiadasz już ten przedmiot (permanent).' };
      }

      if (itemId === 'ticket') {
        const currentCount = inventory[itemId] || 0;
        if (currentCount + quantity > 5) {
          return { error: `❌ Limit biletów na osobę wynosi 5. Obecnie posiadasz: ${currentCount}.` };
        }
      }

      const isPackage = itemId.startsWith('paczka_');
      if (isPackage) {
        const today = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
        if (user.paczkiBoughtLimitDate !== today) {
          user.paczkiBoughtLimitDate = today;
          user.paczkiBoughtToday = 0;
        }

        let limit = 10;
        if (user.badges) {
          if (user.badges.includes(config.badges.wyjdz_z_domu)) {
            limit = 16;
          } else if (user.badges.includes(config.badges.umyj_sie)) {
            limit = 14;
          } else if (user.badges.includes(config.badges.uzalezniony_od_gry)) {
            limit = 12;
          } else if (user.badges.includes(config.badges.oddany_gracz)) {
            limit = 11;
          }
        }

        if (user.paczkiBoughtToday >= limit) {
          return { error: `❌ Osiągnąłeś już dzisiejszy limit zakupu paczek w sklepie (${limit}/${limit}).` };
        }
        if (user.paczkiBoughtToday + quantity > limit) {
          return { error: `❌ Możesz dziś kupić jeszcze tylko **${limit - user.paczkiBoughtToday}** paczek (chcesz kupić: ${quantity}).` };
        }
      }

      const totalPrice = effectivePrice * quantity;
      if (user.balance < totalPrice) {
        return { error: `❌ Brak środków. Potrzebujesz ${formatCurrency(totalPrice)}, posiadasz ${formatCurrency(user.balance)}.` };
      }

      user.balance -= totalPrice;
      addItem(inventory, itemId, quantity);
      if (isPackage) {
        user.paczkiBoughtToday += quantity;
      }
      refreshBadges(user, inventory);

      return { quantity, totalPrice, balance: user.balance, paczkiBoughtToday: isPackage ? user.paczkiBoughtToday : undefined, packageLimit: isPackage ? limit : undefined };
    }).catch(err => {
      console.error('[SKLEP] withData error:', err);
      return { error: '❌ Wystąpił błąd podczas przetwarzania zakupu. Spróbuj ponownie.' };
    });

    if (!result) {
      await message.reply('❌ Wystąpił nieoczekiwany błąd podczas zakupu.');
      return;
    }

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const boughtInfo = result.paczkiBoughtToday !== undefined ? ` [Kupiono dziś paczek: ${result.paczkiBoughtToday}/${result.packageLimit || 10}]` : '';
    await message.reply(`🛒 Zakup udany! Kupiono **${item.name}** x${result.quantity} za **${formatCurrency(result.totalPrice)}**. (Portfel: ${formatCurrency(result.balance)})${boughtInfo}`);
  }
};
