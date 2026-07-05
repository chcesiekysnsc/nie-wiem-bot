const config = require('../config/config');
const { formatCurrency, msToReadable, hasItem, ensureInventoryRecord, getPassiveMultiplier } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'firma',
  aliases: ['przedsiebiorstwo', 'company'],
  async execute(client, message, args) {
    const unlockTime = 1780264800000; // 2026-06-01T00:00:00+02:00
    if (Date.now() < unlockTime) {
      const { errorEmbed } = require('../utils/embeds');
      await message.reply({
        embeds: [errorEmbed('Nieznana komenda', `Komenda \`firma\` nie istnieje.`)]
      }).catch(() => null);
      return;
    }

    const action = String(args[0] || '').toLowerCase();
    const companiesDef = config.economy.companies;

    // Helper: find company definition by ID, number (1-5) or name
    const findCompanyDef = (query) => {
      const q = String(query || '').toLowerCase().trim();
      if (!q) return null;

      // By ID directly
      if (companiesDef[q]) {
        return { id: q, ...companiesDef[q] };
      }

      // By number (1-indexed based on config order)
      const keys = Object.keys(companiesDef);
      const index = parseInt(q, 10);
      if (!isNaN(index) && index >= 1 && index <= keys.length) {
        const id = keys[index - 1];
        return { id, ...companiesDef[id] };
      }

      // By name search (partial match)
      for (const [id, def] of Object.entries(companiesDef)) {
        if (def.name.toLowerCase().includes(q)) {
          return { id, ...companiesDef[id] };
        }
      }

      return null;
    };

    // Render list of available companies
    const renderAvailableList = () => {
      let list = '🏢 **PRZEDSIĘBIORSTWA (SYSTEM FIRM)**\n';
      list += 'Kup firmę, aby generować pasywny dochód co 3 godziny!\n\n';
      list += '📋 **Oferta sprzedaży:**\n';

      let i = 1;
      for (const [id, def] of Object.entries(companiesDef)) {
        const repairCost = def.payout * 4;
        const breakPct = Math.round(def.breakChance * 100);
        
        // Calculate payback time under 4 collections/day (expected payback time formula)
        // expected_payout = payout * (1 - 4 * breakChance)
        const expectedPayout = def.payout * (1 - 4 * def.breakChance);
        const paybackDays = expectedPayout > 0 ? (def.price / expectedPayout / 4).toFixed(1) : 'nigdy';

        list += `**${i}. ${def.emoji} ${def.name}** (ID: \`${id}\`)\n`;
        list += `   ↳ Cena: **${formatCurrency(def.price)}**\n`;
        list += `   ↳ Wypłata: **${formatCurrency(def.payout)}**\n`;
        list += `   ↳ Szansa na awarię: **${breakPct}%** (Naprawa: **${formatCurrency(repairCost)}**)\n`;
        list += `   ↳ Szacowany zwrot: **~${paybackDays} dnia**\n\n`;
        i++;
      }

      list += '💡 *Szacowany zwrot wyliczony przy 4 regularnych zbiorach na dobę.*\n';
      list += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      list += 'Kup firmę wpisując: **!firma kup <numer/ID>**';
      return list;
    };

    // --- SUBCOMMAND: KUP ---
    if (action === 'kup' || action === 'buy') {
      const targetQuery = args.slice(1).join(' ');
      if (!targetQuery) {
        await message.reply('❌ Podaj ID lub numer firmy do kupienia! Przykład: **!firma kup 1** lub **!firma kup kiosk**.');
        return;
      }

      const compDef = findCompanyDef(targetQuery);
      if (!compDef) {
        await message.reply('❌ Nie znaleziono takiej firmy w ofercie! Wpisz **!firma**, aby zobaczyć listę.');
        return;
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (user.company) {
          const currentDef = companiesDef[user.company.id] || { name: 'Obecna firma' };
          return { error: `❌ Posiadasz już firmę: **${currentDef.name}**!\n💡 Aby kupić nową, musisz najpierw sprzedać obecną wpisując **!firma sprzedaj** (otrzymasz 50% zwrotu).` };
        }

        if (user.balance < compDef.price) {
          return { error: `❌ Brak wystarczających środków w portfelu! Cena to **${formatCurrency(compDef.price)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= compDef.price;
        user.company = {
          id: compDef.id,
          boughtAt: Date.now(),
          lastPayout: Date.now() - 3 * 3600 * 1000, // Pozwól na pierwszą wypłatę od razu po kupieniu!
          isBroken: false
        };

        return { success: true, compDef, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Pomyślnie kupiono firmę: **${result.compDef.emoji} ${result.compDef.name}** za **${formatCurrency(result.compDef.price)}**!\n💰 Pozostało w portfelu: **${formatCurrency(result.balance)}**.\n💡 Możesz już odebrać pierwszą wypłatę komendą: **!firma zbierz**!`);
      return;
    }

    // --- SUBCOMMAND: SPRZEDAJ ---
    if (action === 'sprzedaj' || action === 'sell') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.company) {
          return { error: '❌ Nie posiadasz żadnego przedsiębiorstwa do sprzedania!' };
        }

        const compDef = companiesDef[user.company.id];
        if (!compDef) {
          // Fallback if company definition vanished from config
          user.company = null;
          return { error: '⚠️ Twój typ firmy jest nieprawidłowy. Firma została wyczyszczona z bazy.' };
        }

        const refund = Math.floor(compDef.price * 0.5);
        user.balance += refund;
        user.company = null;

        return { success: true, compDef, refund, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💸 Sprzedano firmę **${result.compDef.emoji} ${result.compDef.name}** za **${formatCurrency(result.refund)}** (50% ceny zakupu).\n💰 Twój portfel: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // --- SUBCOMMAND: ZBIERZ / ODBIERZ / WYPLATA ---
    if (action === 'zbierz' || action === 'odbierz' || action === 'wyplata' || action === 'claim') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.company) {
          return { error: '❌ Nie posiadasz żadnego przedsiębiorstwa! Kup je najpierw za pomocą **!firma kup <nr>**.' };
        }

        const compDef = companiesDef[user.company.id];
        if (!compDef) {
          user.company = null;
          return { error: '⚠️ Twój typ firmy jest nieprawidłowy. Firma została wyczyszczona.' };
        }

        if (user.company.isBroken) {
          const repairCost = compDef.payout * 4;
          return { error: `❌ Twoja firma **${compDef.emoji} ${compDef.name}** uległa awarii! Musisz ją naprawić przed kolejną wypłatą.\n🔧 Koszt naprawy: **${formatCurrency(repairCost)}** (Użyj: **!firma napraw**)` };
        }

        const now = Date.now();
        const cooldownMs = 3 * 3600 * 1000;
        const diff = now - (user.company.lastPayout || 0);

        if (diff < cooldownMs) {
          const timeLeft = cooldownMs - diff;
          return { error: `⏳ Twoja firma jeszcze nie wygenerowała kolejnej wypłaty! Wróć za **${msToReadable(timeLeft)}**.` };
        }

        // Give payout
        let payout = compDef.payout;
        const inventory = ensureInventoryRecord(store.inventory, message.author.id);
        
        const garniturBonusPct = getPassiveMultiplier(inventory, 'garnitur', 0.10);
        let garniturBonus = 0;
        if (garniturBonusPct > 0) {
          garniturBonus = Math.floor(compDef.payout * garniturBonusPct);
        }

        const kaczkaBonusPct = getPassiveMultiplier(inventory, 'kaczka_biznesu', 0.05);
        let kaczkaBonus = 0;
        if (kaczkaBonusPct > 0) {
          kaczkaBonus = Math.floor(compDef.payout * kaczkaBonusPct);
        }

        payout += garniturBonus + kaczkaBonus;
        user.balance += payout;
        user.company.lastPayout = now;

        // Check for breakdown (progressive breakdown chance)
        const overrides = store.profiles.chanceOverrides || {};
        const userOverrides = overrides[user.id] || {};
        const overrideBreakChanceRaw = userOverrides['company_breakdown'];
        const effectiveBreakChance = overrideBreakChanceRaw !== undefined && overrideBreakChanceRaw !== null && overrideBreakChanceRaw !== ''
          ? Number(overrideBreakChanceRaw) / 100
          : compDef.breakChance;
        const broke = Number.isFinite(effectiveBreakChance) && Math.random() < effectiveBreakChance;
        if (broke) {
          user.company.isBroken = true;
        }

        return {
          success: true,
          compDef,
          payout,
          garniturBonus,
          garniturBonusPct,
          kaczkaBonus,
          kaczkaBonusPct,
          broke,
          balance: user.balance
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      let replyText = `💰 Zebrałeś wypłatę z firmy **${result.compDef.emoji} ${result.compDef.name}**!\n`;
      if (result.garniturBonus > 0 || result.kaczkaBonus > 0) {
        replyText += `➕ Zysk nominalny: **+${formatCurrency(result.compDef.payout)}**\n`;
        if (result.garniturBonus > 0) {
          const pct = Math.round(result.garniturBonusPct * 100);
          replyText += `👔 **Garnitur (+${pct}%):** **+${formatCurrency(result.garniturBonus)}**\n`;
        }
        if (result.kaczkaBonus > 0) {
          const pct = Math.round(result.kaczkaBonusPct * 100);
          replyText += `🦆 **Kaczka Biznesu (+${pct}%):** **+${formatCurrency(result.kaczkaBonus)}**\n`;
        }
        replyText += `➕ Łączny zysk: **+${formatCurrency(result.payout)}**\n`;
      } else {
        replyText += `➕ Zysk: **+${formatCurrency(result.payout)}**\n`;
      }
      replyText += `💰 Stan portfela: **${formatCurrency(result.balance)}**\n`;

      if (result.broke) {
        const repairCost = result.compDef.payout * 4;
        replyText += `\n⚠️ **AWARIA!** Podczas wypłacania środków doszło do usterki sprzętu w Twojej firmie. Urządzenia zostały uszkodzone.\n`;
        replyText += `🔧 Firma nie wygeneruje zysków, dopóki jej nie naprawisz.\n`;
        replyText += `🔧 Koszt naprawy: **${formatCurrency(repairCost)}** (Wpisz: **!firma napraw**).`;
      } else {
        replyText += `\n⏰ Kolejna wypłata będzie gotowa za **3 godziny**.`;
      }

      await message.reply(replyText);
      return;
    }

    // --- SUBCOMMAND: NAPRAW ---
    if (action === 'napraw' || action === 'repair') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.company) {
          return { error: '❌ Nie posiadasz żadnego przedsiębiorstwa!' };
        }

        const compDef = companiesDef[user.company.id];
        if (!compDef) {
          user.company = null;
          return { error: '⚠️ Twój typ firmy jest nieprawidłowy. Firma została wyczyszczona.' };
        }

        if (!user.company.isBroken) {
          return { error: '✅ Twoja firma jest sprawna i nie wymaga żadnych napraw!' };
        }

        const repairCost = compDef.payout * 4;
        if (user.balance < repairCost) {
          return { error: `❌ Nie stać Cię na naprawę firmy! Koszt to **${formatCurrency(repairCost)}**, a w portfelu masz tylko **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= repairCost;
        user.company.isBroken = false;

        return { success: true, compDef, cost: repairCost, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🔧 Pomyślnie naprawiono firmę **${result.compDef.emoji} ${result.compDef.name}** za kwotę **${formatCurrency(result.cost)}**!\n⚙️ Maszyna ruszyła na nowo i jest gotowa do pracy. Twoje saldo: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // --- DEFAULT ACTION: SHOW STATUS ---
    await withData(async (store) => {
      const user = createUser(message.author.id, store.users);

      if (!user.company) {
        await message.reply(renderAvailableList());
        return;
      }

      const compDef = companiesDef[user.company.id];
      if (!compDef) {
        user.company = null;
        await message.reply(renderAvailableList());
        return;
      }

      // Calculate cooldown
      const now = Date.now();
      const cooldownMs = 3 * 3600 * 1000;
      const diff = now - (user.company.lastPayout || 0);
      const isReady = diff >= cooldownMs;

      let statusMsg = `💼 **TWOJE PRZEDSIĘBIORSTWO**\n`;
      statusMsg += `${compDef.emoji} **${compDef.name}**\n`;
      statusMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      statusMsg += `📊 **Status:** ${user.company.isBroken ? '🔴 Zepsuta (wymaga naprawy!)' : '🟢 Sprawna'}\n`;
      
      if (user.company.isBroken) {
        const repairCost = compDef.payout * 4;
        statusMsg += `⏰ **Wypłata:** Zablokowana (Naprawa: **${formatCurrency(repairCost)}**)\n`;
      } else {
        statusMsg += `⏰ **Wypłata:** ${isReady ? '🟢 Gotowa do odbioru!' : `⏳ Za ${msToReadable(cooldownMs - diff)}`}\n`;
      }
      
      statusMsg += `💰 **Nominalny dochód:** **${formatCurrency(compDef.payout)}** co 3h\n`;
      statusMsg += `🛡️ **Szansa na awarię:** **${Math.round(compDef.breakChance * 100)}%**\n\n`;
      
      statusMsg += `💡 **Dostępne polecenia:**\n`;
      statusMsg += `• 🪙 **!firma zbierz** — odbierz pasywny zysk\n`;
      if (user.company.isBroken) {
        statusMsg += `• 🔧 **!firma napraw** — napraw usterkę za **${formatCurrency(compDef.payout * 4)}**\n`;
      }
      statusMsg += `• 💸 **!firma sprzedaj** — sprzedaj firmę za 50% ceny (zwrot: **${formatCurrency(compDef.price * 0.5)}**)\n\n`;
      
      statusMsg += `💡 Wpisz **!firma kup** bez parametrów, aby zobaczyć ofertę innych firm.`;

      await message.reply(statusMsg);
    });
  }
};
