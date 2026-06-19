const config = require('../config/config');
const { formatCurrency, ensureInventoryRecord, hasItem, addItem, removeItem } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const eventItemIds = [
  'szkarlatne_oko', 'cien_nocy', 'wampirzy_sztylet', 'szwajcarski_klucz', 'krysztal_doswiadczenia',
  'ananas_na_pizzy', 'czarna_bandera', 'czarna_karta', 'kosci_oszusta', 'czterolistna_moneta'
];

const getArtefaktyMap = () => {
  const map = {};
  let num = 1;
  for (const [id, item] of Object.entries(config.shopItems)) {
    if (eventItemIds.includes(id)) continue;
    if (item.buyable !== false) continue;
    map[num++] = {
      id: id,
      name: item.name,
      emoji: item.emoji || '📦'
    };
  }
  return map;
};

module.exports = {
  name: 'rynek',
  aliases: ['market'],
  async execute(client, message, args) {
    const ARTEFAKTY_MAP = getArtefaktyMap();
    const action = String(args[0] || '').toLowerCase();
    const userId = message.author.id;

    const getName = (id) => {
      if (client.userNames && client.userNames.has(id)) {
        return client.userNames.get(id);
      }
      return `Gracz_${id.slice(-6)}`;
    };

    // ==========================================
    // 1. WYSTAW / SPRZEDAJ (!rynek sprzedaj <nr_art> <cena>)
    // ==========================================
    if (action === 'sprzedaj' || action === 'wystaw') {
      const artNum = parseInt(args[1], 10);
      const priceRaw = args[2];

      const art = ARTEFAKTY_MAP[artNum];
      if (!art) {
        await message.reply(`❌ Nieprawidłowy numer artefaktu. Użyj numerów od 1 do ${Object.keys(ARTEFAKTY_MAP).length} (takich jak w **!artefakty**).`);
        return;
      }

      if (!priceRaw) {
        await message.reply('❌ Użyj: **!rynek sprzedaj <nr_artefaktu> <cena>** (np. *!rynek sprzedaj 1 300000*)');
        return;
      }

      const result = await withData(store => {
        const inv = ensureInventoryRecord(store.inventory, userId);
        if (!hasItem(inv, art.id)) {
          return { error: `❌ Nie posiadasz artefaktu **${art.emoji} ${art.name}** w swoim ekwipunku.` };
        }

        const price = Math.floor(Number(priceRaw));
        if (!Number.isFinite(price) || price < 250000) {
          return { error: '❌ Minimalna cena wystawienia na rynku to **250 000** viccoinów.' };
        }

        // Zdejmij przedmiot z ekwipunku
        removeItem(inv, art.id, 1);

        // Dodaj ofertę do bazy
        store.profiles.market = store.profiles.market || [];
        const listingId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        store.profiles.market.push({
          listingId,
          sellerId: userId,
          itemId: art.id,
          price,
          listedAt: Date.now()
        });

        return { success: true, price };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`✅ Pomyślnie wystawiłeś **${art.emoji} ${art.name}** na rynek za **${formatCurrency(result.price)}**! Przedmiot został pobrany z Twojego ekwipunku.`);
      return;
    }

    // ==========================================
    // 2. KUP (!rynek kup <nr_oferty>)
    // ==========================================
    if (action === 'kup' || action === 'nabyj') {
      const offerNum = parseInt(args[1], 10);
      if (!offerNum || offerNum <= 0) {
        await message.reply('❌ Użyj: **!rynek kup <numer_oferty_z_listy>**');
        return;
      }

      const buyResult = await withData(store => {
        store.profiles.market = store.profiles.market || [];
        const index = offerNum - 1;

        if (index < 0 || index >= store.profiles.market.length) {
          return { error: '❌ Nie znaleziono oferty o podanym numerze na rynku.' };
        }

        const offer = store.profiles.market[index];
        if (offer.sellerId === userId) {
          return { error: '❌ Nie możesz kupić własnej oferty! Jeśli chcesz ją wycofać, wpisz: **!rynek wycofaj <numer_oferty>**' };
        }

        const buyer = createUser(userId, store.users);
        if (buyer.balance < offer.price) {
          return { error: `❌ Nie masz wystarczająco pieniędzy w portfelu. Cena: ${formatCurrency(offer.price)}` };
        }

        // Dokonaj transakcji
        buyer.balance -= offer.price;

        const seller = createUser(offer.sellerId, store.users);
        const tax = Math.floor(offer.price * 0.10);
        const payout = offer.price - tax;
        seller.balance += payout;

        const buyerInv = ensureInventoryRecord(store.inventory, userId);
        addItem(buyerInv, offer.itemId, 1);

        // Usuń ofertę z rynku
        store.profiles.market.splice(index, 1);

        const itemInfo = Object.values(ARTEFAKTY_MAP).find(a => a.id === offer.itemId) || { name: offer.itemId, emoji: '📦' };

        return {
          success: true,
          itemName: itemInfo.name,
          itemEmoji: itemInfo.emoji,
          price: offer.price,
          payout,
          tax,
          sellerId: offer.sellerId,
          sellerName: getName(offer.sellerId),
          sellerThreadId: seller.lastActiveThreadId
        };
      });

      if (buyResult.error) {
        await message.reply(buyResult.error);
        return;
      }

      // Wyślij potwierdzenie
      await message.reply(
        `🎉 Pomyślnie kupiłeś **${buyResult.itemEmoji} ${buyResult.itemName}** od **${buyResult.sellerName}**!\n` +
        `💸 Cena: **${formatCurrency(buyResult.price)}** (została pobrana z Twojego portfela).\n` +
        `📦 Przedmiot trafił do Twojego ekwipunku (**!eq**).`
      );

      // Powiadomienie dla sprzedawcy (wyślemy na ostatnią grupę, na której sprzedawca użył komendy)
      if (client.api && buyResult.sellerThreadId) {
        try {
          const buyerName = message.author?.username || getName(userId);
          client.api.sendMessage(
            `💰 **RYNEK ALARM!** Użytkownik **${buyerName}** kupił Twój wystawiony przedmiot **${buyResult.itemEmoji} ${buyResult.itemName}**!\n` +
            `Otrzymujesz: **+${formatCurrency(buyResult.payout)}** (cena ${formatCurrency(buyResult.price)} minus 10% podatku).`,
            buyResult.sellerThreadId
          );
        } catch (err) {
          console.error('[RYNEK] Błąd wysyłania powiadomienia do sprzedawcy:', err);
        }
      }
      return;
    }

    // ==========================================
    // 3. WYCOFAJ / ANULUJ (!rynek wycofaj <nr_oferty>)
    // ==========================================
    if (action === 'wycofaj' || action === 'anuluj') {
      const offerNum = parseInt(args[1], 10);
      if (!offerNum || offerNum <= 0) {
        await message.reply('❌ Użyj: **!rynek wycofaj <numer_oferty_z_listy>**');
        return;
      }

      const cancelResult = await withData(store => {
        store.profiles.market = store.profiles.market || [];
        const index = offerNum - 1;

        if (index < 0 || index >= store.profiles.market.length) {
          return { error: '❌ Nie znaleziono oferty o podanym numerze na rynku.' };
        }

        const offer = store.profiles.market[index];
        if (offer.sellerId !== userId) {
          return { error: '❌ Możesz wycofać tylko własne oferty.' };
        }

        // Zwróć przedmiot
        const sellerInv = ensureInventoryRecord(store.inventory, userId);
        addItem(sellerInv, offer.itemId, 1);

        // Usuń z rynku
        store.profiles.market.splice(index, 1);

        const itemInfo = Object.values(ARTEFAKTY_MAP).find(a => a.id === offer.itemId) || { name: offer.itemId, emoji: '📦' };

        return {
          success: true,
          itemName: itemInfo.name,
          itemEmoji: itemInfo.emoji
        };
      });

      if (cancelResult.error) {
        await message.reply(cancelResult.error);
        return;
      }

      await message.reply(`✅ Oferta wycofana! Artefakt **${cancelResult.itemEmoji} ${cancelResult.itemName}** wrócił do Twojego ekwipunku.`);
      return;
    }

    // ==========================================
    // 4. LISTOWANIE OFERT (!rynek)
    // ==========================================
    const marketList = await withData(store => {
      store.profiles.market = store.profiles.market || [];
      return store.profiles.market.map((offer, i) => {
        const itemInfo = Object.values(ARTEFAKTY_MAP).find(a => a.id === offer.itemId) || { name: offer.itemId, emoji: '📦' };
        const sellerName = getName(offer.sellerId);
        return `${i + 1}. **${itemInfo.emoji} ${itemInfo.name}** — Cena: **${formatCurrency(offer.price)}** (Wystawił: *${sellerName}*)`;
      });
    });

    if (marketList.length === 0) {
      await message.reply(
        `🏛️ **Globalny Rynek Artefaktów** 🏛️\n` +
        `Obecnie brak jakichkolwiek wystawionych ofert.\n\n` +
        `💡 Chcesz coś wystawić? Wpisz:\n` +
        `**!rynek sprzedaj <nr_artefaktu_z_!artefakty> <cena>**\n` +
        `*(np. !rynek sprzedaj 1 250000)*`
      );
      return;
    }

    const response = 
      `🏛️ **Globalny Rynek Artefaktów** 🏛️\n` +
      `Oto aktualne oferty sprzedaży artefaktów na rynku:\n\n` +
      marketList.join('\n') + `\n\n` +
      `🛒 Aby kupić przedmiot, wpisz: **!rynek kup <numer>**\n` +
      `❌ Aby wycofać swoją ofertę, wpisz: **!rynek wycofaj <numer>**`;

    await message.reply(response);
  }
};
