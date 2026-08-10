const config = require('../config/config');
const { formatCurrency, msToReadable, hasItem, ensureInventoryRecord, getPassiveMultiplier, getCompanyPayoutMultiplier, getGlobalIncomeMultiplier, getItemUpgradeLevel } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { getItemSetBonus } = require('../utils/itemSets');
const { getWorkerDef, applyWorkerEffects } = require('../utils/workerEffects');

const WORKER_ORDER = ['lary', 'alan', 'rafal', 'wojtek', 'eryk'];

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
    const companyTiers = ['kiosk', 'restauracja', 'salon', 'stocznia', 'bank'];

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
        
        const expectedDailyPayout = def.payout * 4 * (1 - 4 * def.breakChance);
        const paybackDays = expectedDailyPayout > 0 ? (def.price / expectedDailyPayout).toFixed(1) : 'nigdy';

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
          lastPayout: Date.now() - 3 * 3600 * 1000,
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
        const inventory = ensureInventoryRecord(store.inventory, message.author.id);
        const companyMul = getCompanyPayoutMultiplier();
        const hasKsiega = hasItem(inventory, 'ksiega_monopolisty');
        const hasInsygnia = hasItem(inventory, 'krolewskie_insygnia');
        const now = Date.now();
        const cooldownMs = 3 * 3600 * 1000;

        const overrides = (store.profiles && store.profiles.chanceOverrides && store.profiles.chanceOverrides[message.author.id]) || {};
        const breakChanceOverride = overrides['company_breakdown'];
        // Override is only active when explicitly set to a value OTHER than the REGISTRY default (50)
        const COMPANY_BREAKDOWN_REGISTRY_DEFAULT = 50;
        const hasBreakdownOverride = breakChanceOverride !== undefined && breakChanceOverride !== null && breakChanceOverride !== '' && Number(breakChanceOverride) !== COMPANY_BREAKDOWN_REGISTRY_DEFAULT;

        if (!user.company && !user.company2) {
          return { error: '❌ Nie posiadasz żadnego przedsiębiorstwa! Kup je najpierw za pomocą **!firma kup <nr>**.' };
        }

        let collected1 = null;
        let collected2 = null;
        let errors = [];

        // Helper to calculate company payout
        const calcPayout = (compDef, companyObj, label, naprawCmd, userWorkers) => {
          if (!compDef) return null;
          if (companyObj.isBroken) {
            const repairCost = compDef.payout * 4;
            errors.push(`❌ ${label} **${compDef.emoji} ${compDef.name}** uległa awarii! Koszt naprawy: **${formatCurrency(repairCost)}** (Użyj: **${naprawCmd}**)`);
            return null;
          }
          const diff = now - (companyObj.lastPayout || 0);
          if (diff < cooldownMs) {
            const timeLeft = cooldownMs - diff;
            errors.push(`⏳ ${label} (**${compDef.name}**) nie wygenerowała jeszcze zysku. Wróć za **${msToReadable(timeLeft)}**.`);
            return null;
          }

          let payout = compDef.payout;
          if (companyMul !== 1) {
            payout = Math.floor(payout * companyMul);
          }
          const garniturBonusPct = getPassiveMultiplier(inventory, 'garnitur', 0.10);
          let garniturBonus = garniturBonusPct > 0 ? Math.floor(compDef.payout * garniturBonusPct) : 0;
          const kaczkaBonusPct = getPassiveMultiplier(inventory, 'kaczka_biznesu', 0.05);
          let kaczkaBonus = kaczkaBonusPct > 0 ? Math.floor(compDef.payout * kaczkaBonusPct) : 0;
          const inwestorBonusPct = getPassiveMultiplier(inventory, 'inwestor', 0.03);
          let inwestorBonus = inwestorBonusPct > 0 ? Math.floor(compDef.payout * inwestorBonusPct) : 0;
          let ksiegaBonus = hasKsiega ? Math.floor(compDef.payout * 0.15) : 0;
          payout += garniturBonus + kaczkaBonus + inwestorBonus + ksiegaBonus;

          const globalIncomeBonus = getGlobalIncomeMultiplier(inventory);
          let globalBonus = globalIncomeBonus > 0 ? Math.floor(compDef.payout * globalIncomeBonus) : 0;
          payout += globalBonus;

          const setBonusPct = getItemSetBonus(inventory, 'firm_income');
          let setBonus = setBonusPct > 0 ? Math.floor(compDef.payout * setBonusPct) : 0;
          payout += setBonus;

          // Królewskie Insygnia: +10% do zysku z firmy
          let insygniaBonus = 0;
          if (hasInsygnia) {
            const level = getItemUpgradeLevel(inventory, 'krolewskie_insygnia');
            const bonus = 0.10 + level * 0.01;
            insygniaBonus = Math.floor(payout * bonus);
            payout += insygniaBonus;
          }

          companyObj.lastPayout = now;

          // Apply worker effects
          const workerResult = applyWorkerEffects(payout, userWorkers, compDef, companyObj, inventory, breakChanceOverride);
          payout = workerResult.payout;

          const broke = workerResult.broke;

          return { compDef, payout, garniturBonus, kaczkaBonus, ksiegaBonus, insygniaBonus, globalBonus, setBonus, workerSalary: workerResult.workerSalary, bonusTriggered: workerResult.bonusTriggered, skipSalary: workerResult.skipSalary, instantRepair: workerResult.instantRepair, repairDiscount: workerResult.repairDiscount, broke };
        };

        // Check company 1
        if (user.company) {
          const compDef = companiesDef[user.company.id];
          if (!compDef) {
            user.company = null;
          } else {
            collected1 = calcPayout(compDef, user.company, 'Twoja pierwsza firma', '!firma napraw', user.workers);
          }
        }

        // Check company 2
        if (user.company2) {
          const compDef = companiesDef[user.company2.id];
          if (!compDef) {
            user.company2 = null;
          } else {
            collected2 = calcPayout(compDef, user.company2, 'Twoja druga firma', '!firma2 napraw', user.workers);
          }
        }

        if (!collected1 && !collected2) {
          return { error: errors.join('\n') };
        }

        let totalPayout = 0;
        if (collected1) totalPayout += collected1.payout;
        if (collected2) totalPayout += collected2.payout;
        user.balance += totalPayout;

        return {
          success: true,
          collected1,
          collected2,
          totalPayout,
          balance: user.balance
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      let replyText = '';
      
      const formatFirmaPayout = (col, label) => {
        let txt = `💰 Zebrałeś wypłatę z ${label} **${col.compDef.emoji} ${col.compDef.name}**!\n`;
        if (col.garniturBonus > 0 || col.kaczkaBonus > 0 || col.ksiegaBonus > 0 || col.insygniaBonus > 0 || col.globalBonus > 0 || col.setBonus > 0) {
          txt += `   ➕ Zysk nominalny: **+${formatCurrency(col.compDef.payout)}**\n`;
          if (col.garniturBonus > 0) {
            txt += `   👔 **Garnitur (+10%):** **+${formatCurrency(col.garniturBonus)}**\n`;
          }
          if (col.kaczkaBonus > 0) {
            txt += `   🦆 **Kaczka Biznesu (+5%):** **+${formatCurrency(col.kaczkaBonus)}**\n`;
          }
          if (col.ksiegaBonus > 0) {
            txt += `   📕 **Księga Monopolisty (+15%):** **+${formatCurrency(col.ksiegaBonus)}**\n`;
          }
          if (col.insygniaBonus > 0) {
            txt += `   👑 **Królewskie Insygnia (+10%):** **+${formatCurrency(col.insygniaBonus)}**\n`;
          }
          if (col.globalBonus > 0) {
            txt += `   💰 **Sakiewka Kolekcjonera (+3%):** **+${formatCurrency(col.globalBonus)}**\n`;
          }
          if (col.setBonus > 0) {
            txt += `   🧩 **Zestaw Biznesmena (+4%):** **+${formatCurrency(col.setBonus)}**\n`;
          }
          txt += `   ➕ Zysk z firmy: **+${formatCurrency(col.payout)}**\n`;
        } else {
          txt += `   ➕ Zysk z firmy: **+${formatCurrency(col.payout)}**\n`;
        }
        if (col.workerSalary > 0) {
          txt += `   👷 **Wynagrodzenie pracowników:** **-${formatCurrency(col.workerSalary)}**\n`;
        }
        if (col.skipSalary) {
          txt += `   🎲 **Pracownik odważył się nie pobrać wypłaty!**\n`;
        }
        if (col.bonusTriggered) {
          txt += `   🎉 **Bonus pracowniczy!** Zysk został zwiększony!\n`;
        }
        if (col.instantRepair) {
          txt += `   🔧 **Pracownik naprawił firmę za darmo!**\n`;
        }
        if (col.repairDiscount) {
          txt += `   🛠️ **Pracownik znalazł tanią naprawę!**\n`;
        }
        if (col.broke) {
          const repairCost = col.compDef.payout * 4;
          txt += `   ⚠️ **AWARIA!** Doszło do usterki sprzętu w tej firmie.\n   🔧 Wymagana naprawa za **${formatCurrency(repairCost)}**.\n`;
        }
        return txt;
      };

      if (result.collected1) {
        replyText += formatFirmaPayout(result.collected1, 'pierwszej firmy');
        replyText += '\n';
      }
      if (result.collected2) {
        replyText += formatFirmaPayout(result.collected2, 'drugiej firmy');
        replyText += '\n';
      }

      replyText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      replyText += `💰 **Łączny zebrany zysk:** **+${formatCurrency(result.totalPayout)}**\n`;
      replyText += `💰 **Stan portfela:** **${formatCurrency(result.balance)}**`;

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

        const baseRepairCost = compDef.payout * 4;
        
        // Check for worker repair discount
        let repairDiscount = false;
        const workers = user.workers || [];
        for (const wid of workers) {
          const def = getWorkerDef(wid);
          if (def && def.repairDiscountChance && Math.random() < def.repairDiscountChance) {
            repairDiscount = true;
            break;
          }
        }
        
        const repairCost = repairDiscount ? Math.floor(baseRepairCost * 0.9) : baseRepairCost;
        
        if (user.balance < repairCost) {
          return { error: `❌ Nie stać Cię na naprawę firmy! Koszt to **${formatCurrency(repairCost)}**, a w portfelu masz tylko **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= repairCost;
        user.company.isBroken = false;

        return { success: true, compDef, cost: repairCost, balance: user.balance, repairDiscount };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      let replyText = `🔧 Pomyślnie naprawiono firmę **${result.compDef.emoji} ${result.compDef.name}** za kwotę **${formatCurrency(result.cost)}**!\n`;
      if (result.repairDiscount) {
        replyText += `🛠️ Pracownik znalazł tanią naprawę! (10% zniżki)\n`;
      }
      replyText += `⚙️ Maszyna ruszyła na nowo i jest gotowa do pracy. Twoje saldo: **${formatCurrency(result.balance)}**.`;
      await message.reply(replyText);
      return;
    }

    // --- DEFAULT ACTION: SHOW STATUS ---
    await withData(async (store) => {
      const user = createUser(message.author.id, store.users);

      if (!user.company && !user.company2) {
        await message.reply(renderAvailableList());
        return;
      }

      let statusMsg = `💼 **TWOJE PRZEDSIĘBIORSTWA**\n\n`;

      if (user.company) {
        const compDef = companiesDef[user.company.id];
        if (compDef) {
          const now = Date.now();
          const cooldownMs = 3 * 3600 * 1000;
          const diff = now - (user.company.lastPayout || 0);
          const isReady = diff >= cooldownMs;

          statusMsg += `1️⃣ **FIRMA:** ${compDef.emoji} **${compDef.name}**\n`;
          statusMsg += `   • Status: ${user.company.isBroken ? '🔴 Zepsuta (wymaga naprawy!)' : '🟢 Sprawna'}\n`;
          if (user.company.isBroken) {
            const repairCost = compDef.payout * 4;
            statusMsg += `   • Wypłata: Zablokowana (Naprawa: **${formatCurrency(repairCost)}** — użyj **!firma napraw**)\n`;
          } else {
            statusMsg += `   • Wypłata: ${isReady ? '🟢 Gotowa do odbioru!' : `⏳ Za ${msToReadable(cooldownMs - diff)}`}\n`;
          }
          statusMsg += `   • Dochód nominalny: **${formatCurrency(compDef.payout)}** co 3h\n\n`;
        }
      }

      if (user.company2) {
        const compDef = companiesDef[user.company2.id];
        if (compDef) {
          const now = Date.now();
          const cooldownMs = 3 * 3600 * 1000;
          const diff = now - (user.company2.lastPayout || 0);
          const isReady = diff >= cooldownMs;

          statusMsg += `2️⃣ **DRUGA FIRMA:** ${compDef.emoji} **${compDef.name}**\n`;
          statusMsg += `   • Status: ${user.company2.isBroken ? '🔴 Zepsuta (wymaga naprawy!)' : '🟢 Sprawna'}\n`;
          if (user.company2.isBroken) {
            const repairCost = compDef.payout * 4;
            statusMsg += `   • Wypłata: Zablokowana (Naprawa: **${formatCurrency(repairCost)}** — użyj **!firma2 napraw**)\n`;
          } else {
            statusMsg += `   • Wypłata: ${isReady ? '🟢 Gotowa do odbioru!' : `⏳ Za ${msToReadable(cooldownMs - diff)}`}\n`;
          }
          statusMsg += `   • Dochód nominalny: **${formatCurrency(compDef.payout)}** co 3h\n\n`;
        }
      }

      statusMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      statusMsg += `💡 **Dostępne polecenia:**\n`;
      statusMsg += `• 🪙 **!firma zbierz** — odbierz pasywny zysk\n`;
      if (user.company && user.company.isBroken) {
        statusMsg += `• 🔧 **!firma napraw** — napraw firmę\n`;
      }
      if (user.company) {
        statusMsg += `• 💸 **!firma sprzedaj** — sprzedaj firmę (50% ceny)\n`;
      }

      if (user.workers && user.workers.length > 0) {
        statusMsg += `\n👷 **TWOI PRACOWNICY:**\n`;
        for (const wid of user.workers) {
          const def = getWorkerDef(wid);
          if (def) {
            statusMsg += `• ${def.stars} **${def.name}** — pobiera ${Math.round(def.salaryPercent * 100)}% wypłaty\n`;
          }
        }
        statusMsg += `\n💡 Zarządzaj pracownikami: **!pracownik**\n`;
      } else {
        statusMsg += `\n💡 Kup pracowników: **!pracownik**\n`;
      }

      await message.reply(statusMsg);
    });
  }
};
