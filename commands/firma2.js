const config = require('../config/config');
const { formatCurrency, msToReadable, hasItem, ensureInventoryRecord, getPassiveMultiplier } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getWorkerDef } = require('../utils/workerEffects');

module.exports = {
  name: 'firma2',
  aliases: ['przedsiebiorstwo2', 'company2'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();
    const companiesDef = config.economy.companies;
    const companyTiers = ['stacja_paliw', 'cukiernia', 'kiosk', 'restauracja', 'salon', 'stocznia', 'bank', 'elektrownia'];

    // Helper: find company definition by ID, number (1-5) or name
    const findCompanyDef = (query) => {
      const q = String(query || '').toLowerCase().trim();
      if (!q) return null;

      if (companiesDef[q]) {
        return { id: q, ...companiesDef[q] };
      }

      const keys = Object.keys(companiesDef);
      const index = parseInt(q, 10);
      if (!isNaN(index) && index >= 1 && index <= keys.length) {
        const id = keys[index - 1];
        return { id, ...companiesDef[id] };
      }

      for (const [id, def] of Object.entries(companiesDef)) {
        if (def.name.toLowerCase().includes(q)) {
          return { id, ...companiesDef[id] };
        }
      }

      return null;
    };

    // Render list of available companies
    const renderAvailableList = () => {
      let list = '🏢 **PRZEDSIĘBIORSTWA - DRUGA FIRMA**\n';
      list += 'Możesz zakupić drugą firmę o co najmniej jeden tier niższą niż Twoja główna firma!\n\n';
      list += '📋 **Oferta sprzedaży:**\n';

      let i = 1;
      for (const [id, def] of Object.entries(companiesDef)) {
        const repairCost = def.repairCost || (def.payout * 4);
        const breakPct = Math.round(def.breakChance * 100);

        list += `**${i}. ${def.emoji} ${def.name}** (ID: \`${id}\`)\n`;
        list += `   ↳ Cena: **${formatCurrency(def.price)}**\n`;
        list += `   ↳ Wypłata: **${formatCurrency(def.payout)}**\n`;
        list += `   ↳ Szansa na awarię: **${breakPct}%** (Naprawa: **${formatCurrency(repairCost)}**)\n\n`;
        i++;
      }

      list += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      list += 'Kup drugą firmę wpisując: **!firma2 kup <numer/ID>**';
      return list;
    };

    // --- SECURE: Check License ---
    const hasLicense = await withData(store => {
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      return hasItem(inventory, 'licencja_monopolisty');
    });

    if (!hasLicense) {
      await message.reply('❌ Nie posiadasz przedmiotu 🏢 **Licencja Monopolisty**, który jest wymagany do korzystania z tej komendy.');
      return;
    }

    // --- SUBCOMMAND: KUP ---
    if (action === 'kup' || action === 'buy') {
      const targetQuery = args.slice(1).join(' ');
      if (!targetQuery) {
        await message.reply('❌ Podaj ID lub numer drugiej firmy do kupienia! Przykład: **!firma2 kup 1** lub **!firma2 kup kiosk**.');
        return;
      }

      const compDef = findCompanyDef(targetQuery);
      if (!compDef) {
        await message.reply('❌ Nie znaleziono takiej firmy w ofercie! Wpisz **!firma2**, aby zobaczyć listę.');
        return;
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.company) {
          return { error: '❌ Musisz najpierw posiadać pierwszą (główną) firmę! Kup ją przez **!firma kup <nr>**.' };
        }

        if (user.company2) {
          const currentDef2 = companiesDef[user.company2.id] || { name: 'Obecna druga firma' };
          return { error: `❌ Posiadasz już drugą firmę: **${currentDef2.name}**!\n💡 Aby kupić nową, musisz najpierw ją sprzedać wpisując **!firma2 sprzedaj**.` };
        }

        const idx1 = companyTiers.indexOf(user.company.id);
        const idx2 = companyTiers.indexOf(compDef.id);
        if (idx2 >= idx1) {
          return { error: `❌ Druga firma musi być o co najmniej jeden tier niższa niż Twoja pierwsza firma (**${companiesDef[user.company.id].name}**).` };
        }

        if (user.balance < compDef.price) {
          return { error: `❌ Brak wystarczających środków w portfelu! Cena to **${formatCurrency(compDef.price)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= compDef.price;
        user.company2 = {
          id: compDef.id,
          boughtAt: Date.now(),
          lastPayout: Date.now() - 3 * 3600 * 1000,
          isBroken: false
        };

        return { success: true, compDef, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Pomyślnie kupiono drugą firmę: **${result.compDef.emoji} ${result.compDef.name}** za **${formatCurrency(result.compDef.price)}**!\n💰 Pozostało w portfelu: **${formatCurrency(result.balance)}**.\n💡 Zyski zbierasz automatycznie komendą: **!firma zbierz**!`);
      return;
    }

    // --- SUBCOMMAND: SPRZEDAJ ---
    if (action === 'sprzedaj' || action === 'sell') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.company2) {
          return { error: '❌ Nie posiadasz drugiej firmy do sprzedania!' };
        }

        const compDef = companiesDef[user.company2.id];
        if (!compDef) {
          user.company2 = null;
          return { error: '⚠️ Twój typ drugiej firmy jest nieprawidłowy. Firma została wyczyszczona z bazy.' };
        }

        const refund = Math.floor(compDef.price * 0.5);
        user.balance += refund;
        user.company2 = null;

        return { success: true, compDef, refund, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💸 Sprzedano drugą firmę **${result.compDef.emoji} ${result.compDef.name}** za **${formatCurrency(result.refund)}** (50% ceny zakupu).\n💰 Twój portfel: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // --- SUBCOMMAND: NAPRAW ---
    if (action === 'napraw' || action === 'repair') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.company2) {
          return { error: '❌ Nie posiadasz drugiej firmy!' };
        }

        const compDef = companiesDef[user.company2.id];
        if (!compDef) {
          user.company2 = null;
          return { error: '⚠️ Twój typ drugiej firmy jest nieprawidłowy. Firma została wyczyszczona.' };
        }

        if (!user.company2.isBroken) {
          return { error: '✅ Twoja druga firma jest sprawna i nie wymaga żadnych napraw!' };
        }

        const repairCost = compDef.repairCost || (compDef.payout * 4);
        if (user.balance < repairCost) {
          return { error: `❌ Nie stać Cię na naprawę drugiej firmy! Koszt to **${formatCurrency(repairCost)}**, a w portfelu masz tylko **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= repairCost;
        user.company2.isBroken = false;

        return { success: true, compDef, cost: repairCost, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🔧 Pomyślnie naprawiono drugą firmę **${result.compDef.emoji} ${result.compDef.name}** za kwotę **${formatCurrency(result.cost)}**!\n⚙️ Maszyna ruszyła na nowo i jest gotowa do pracy. Twoje saldo: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // --- DEFAULT ACTION: SHOW STATUS ---
    await withData(async (store) => {
      const user = createUser(message.author.id, store.users);

      if (!user.company2) {
        await message.reply(renderAvailableList());
        return;
      }

      const compDef = companiesDef[user.company2.id];
      if (!compDef) {
        user.company2 = null;
        await message.reply(renderAvailableList());
        return;
      }

      const now = Date.now();
      const cooldownMs = 3 * 3600 * 1000;
      const diff = now - (user.company2.lastPayout || 0);
      const isReady = diff >= cooldownMs;

      let statusMsg = `💼 **TWOJA DRUGA FIRMA**\n`;
      statusMsg += `${compDef.emoji} **${compDef.name}**\n`;
      statusMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      statusMsg += `📊 **Status:** ${user.company2.isBroken ? '🔴 Zepsuta (wymaga naprawy!)' : '🟢 Sprawna'}\n`;
      
      if (user.company2.isBroken) {
        const repairCost = compDef.repairCost || (compDef.payout * 4);
        statusMsg += `⏰ **Wypłata:** Zablokowana (Naprawa: **${formatCurrency(repairCost)}** — użyj **!firma2 napraw**)\n`;
      } else {
        statusMsg += `⏰ **Wypłata:** ${isReady ? '🟢 Gotowa do odbioru!' : `⏳ Za ${msToReadable(cooldownMs - diff)}`}\n`;
      }
      
      statusMsg += `💰 **Nominalny dochód:** **${formatCurrency(compDef.payout)}** co 3h\n`;
      statusMsg += `🛡️ **Szansa na awarię:** **${Math.round(compDef.breakChance * 100)}%**\n\n`;
      
      statusMsg += `💡 **Dostępne polecenia:**\n`;
      statusMsg += `• 🔧 **!firma2 napraw** — napraw usterkę drugiej firmy\n`;
      statusMsg += `• 💸 **!firma2 sprzedaj** — sprzedaj drugą firmę za 50% ceny (zwrot: **${formatCurrency(compDef.price * 0.5)}**)\n\n`;
      statusMsg += `💡 Zysk z obu firm zbierasz komendą: **!firma zbierz**!`;

      if (user.worker) {
        statusMsg += `\n\n👷 **TWÓJ PRACOWNIK:**\n`;
        const def = getWorkerDef(user.worker);
        if (def) {
          statusMsg += `• ${def.stars} **${def.name}** — pobiera ${Math.round(def.salaryPercent * 100)}% wypłaty\n`;
        }
      }

      await message.reply(statusMsg);
    });
  }
};
