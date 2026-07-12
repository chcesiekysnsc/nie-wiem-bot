const config = require('../config/config');
const { formatCurrency, msToReadable, hasItem, ensureInventoryRecord, getPassiveMultiplier, getCompanyPayoutMultiplier } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');

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
        
        // Calculate payback time under 4 collections/day
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

    // --- SUBCOMMAND: KUP2 ---
    if (action === 'kup2' || action === 'buy2') {
      const targetQuery = args.slice(1).join(' ');
      if (!targetQuery) {
        await message.reply('❌ Podaj ID lub numer drugiej firmy do kupienia! Przykład: **!firma kup2 1** lub **!firma kup2 kiosk**.');
        return;
      }

      const compDef = findCompanyDef(targetQuery);
      if (!compDef) {
        await message.reply('❌ Nie znaleziono takiej firmy w ofercie! Wpisz **!firma**, aby zobaczyć listę.');
        return;
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        const inventory = ensureInventoryRecord(store.inventory, message.author.id);

        if (!hasItem(inventory, 'licencja_monopolisty')) {
          return { error: '❌ Musisz posiadać przedmiot 🏢 **Licencja Monopolisty**, aby móc posiadać drugą firmę jednocześnie!' };
        }

        if (!user.company) {
          return { error: '❌ Musisz najpierw kupić pierwszą firmę za pomocą **!firma kup <nr>**!' };
        }

        if (user.company2) {
          const currentDef2 = companiesDef[user.company2.id] || { name: 'Obecna druga firma' };
          return { error: `❌ Posiadasz już drugą firmę: **${currentDef2.name}**!\n💡 Aby kupić nową, musisz najpierw ją sprzedać wpisując **!firma sprzedaj2**.` };
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
          lastPayout: Date.now() - 3 * 3600 * 1000, // Pozwól na pierwszą wypłatę od razu po kupieniu!
          isBroken: false
        };

        return { success: true, compDef, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Pomyślnie kupiono drugą firmę: **${result.compDef.emoji} ${result.compDef.name}** za **${formatCurrency(result.compDef.price)}**!\n💰 Pozostało w portfelu: **${formatCurrency(result.balance)}**.\n💡 Możesz już odebrać pierwszą wypłatę komendą: **!firma zbierz**!`);
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

    // --- SUBCOMMAND: SPRZEDAJ2 ---
    if (action === 'sprzedaj2' || action === 'sell2') {
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

    // --- SUBCOMMAND: ZBIERZ / ODBIERZ / WYPLATA ---
    if (action === 'zbierz' || action === 'odbierz' || action === 'wyplata' || action === 'claim') {
      const companyBreakdownOverride = await getEffectiveChance(message.author.id, 'company_breakdown');

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        const inventory = ensureInventoryRecord(store.inventory, message.author.id);
        const companyMul = getCompanyPayoutMultiplier();
        const hasKsiega = hasItem(inventory, 'ksiega_monopolisty');
        const now = Date.now();
        const cooldownMs = 3 * 3600 * 1000;

        if (!user.company && !user.company2) {
          return { error: '❌ Nie posiadasz żadnego przedsiębiorstwa! Kup je najpierw za pomocą **!firma kup <nr>**.' };
        }

        let collected1 = null;
        let collected2 = null;
        let errors = [];

        // Check company 1
        if (user.company) {
          const compDef = companiesDef[user.company.id];
          if (!compDef) {
            user.company = null;
          } else if (user.company.isBroken) {
            const repairCost = compDef.payout * 4;
            errors.push(`❌ Twoja pierwsza firma **${compDef.emoji} ${compDef.name}** uległa awarii! Koszt naprawy: **${formatCurrency(repairCost)}** (Użyj: **!firma napraw**)`);
          } else {
            const diff = now - (user.company.lastPayout || 0);
            if (diff < cooldownMs) {
              const timeLeft = cooldownMs - diff;
              errors.push(`⏳ Pierwsza firma (**${compDef.name}**) nie wygenerowała jeszcze zysku. Wróć za **${msToReadable(timeLeft)}**.`);
            } else {
              // Calculate payout for company 1
              let payout = compDef.payout;
              if (companyMul !== 1) {
                payout = Math.floor(payout * companyMul);
              }
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
              let ksiegaBonus = 0;
              if (hasKsiega) {
                ksiegaBonus = Math.floor(compDef.payout * 0.15);
              }
              payout += garniturBonus + kaczkaBonus + ksiegaBonus;
              
              user.company.lastPayout = now;
              let breakChance = Number.isFinite(companyBreakdownOverride) ? companyBreakdownOverride / 100 : compDef.breakChance;
              if (hasKsiega) {
                breakChance = Math.max(0, breakChance - 0.02);
              }
              const broke = Math.random() < breakChance;
              if (broke) {
                user.company.isBroken = true;
              }

              collected1 = {
                compDef,
                payout,
                garniturBonus,
                kaczkaBonus,
                ksiegaBonus,
                broke
              };
            }
          }
        }

        // Check company 2
        if (user.company2) {
          const compDef = companiesDef[user.company2.id];
          if (!compDef) {
            user.company2 = null;
          } else if (user.company2.isBroken) {
            const repairCost = compDef.payout * 4;
            errors.push(`❌ Twoja druga firma **${compDef.emoji} ${compDef.name}** uległa awarii! Koszt naprawy: **${formatCurrency(repairCost)}** (Użyj: **!firma napraw2**)`);
          } else {
            const diff = now - (user.company2.lastPayout || 0);
            if (diff < cooldownMs) {
              const timeLeft = cooldownMs - diff;
              errors.push(`⏳ Druga firma (**${compDef.name}**) nie wygenerowała jeszcze zysku. Wróć za **${msToReadable(timeLeft)}**.`);
            } else {
              // Calculate payout for company 2
              let payout = compDef.payout;
              if (companyMul !== 1) {
                payout = Math.floor(payout * companyMul);
              }
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
              let ksiegaBonus = 0;
              if (hasKsiega) {
                ksiegaBonus = Math.floor(compDef.payout * 0.15);
              }
              payout += garniturBonus + kaczkaBonus + ksiegaBonus;
              
              user.company2.lastPayout = now;
              let breakChance = Number.isFinite(companyBreakdownOverride) ? companyBreakdownOverride / 100 : compDef.breakChance;
              if (hasKsiega) {
                breakChance = Math.max(0, breakChance - 0.02);
              }
              const broke = Math.random() < breakChance;
              if (broke) {
                user.company2.isBroken = true;
              }

              collected2 = {
                compDef,
                payout,
                garniturBonus,
                kaczkaBonus,
                ksiegaBonus,
                broke
              };
            }
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
        if (col.garniturBonus > 0 || col.kaczkaBonus > 0 || col.ksiegaBonus > 0) {
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
          txt += `   ➕ Zysk z firmy: **+${formatCurrency(col.payout)}**\n`;
        } else {
          txt += `   ➕ Zysk z firmy: **+${formatCurrency(col.payout)}**\n`;
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

    // --- SUBCOMMAND: NAPRAW2 --- (Handled in action check above)

    // --- DEFAULT ACTION: SHOW STATUS ---
    await withData(async (store) => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const hasLicense = hasItem(inventory, 'licencja_monopolisty');

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

          statusMsg += `1️⃣ **PIERWSZA FIRMA:** ${compDef.emoji} **${compDef.name}**\n`;
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
            statusMsg += `   • Wypłata: Zablokowana (Naprawa: **${formatCurrency(repairCost)}** — użyj **!firma napraw2**)\n`;
          } else {
            statusMsg += `   • Wypłata: ${isReady ? '🟢 Gotowa do odbioru!' : `⏳ Za ${msToReadable(cooldownMs - diff)}`}\n`;
          }
          statusMsg += `   • Dochód nominalny: **${formatCurrency(compDef.payout)}** co 3h\n\n`;
        }
      } else if (hasLicense) {
        statusMsg += `2️⃣ **DRUGA FIRMA:** ❌ Brak (Kup przy użyciu: **!firma kup2 <nr>**)\n\n`;
      }

      statusMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      statusMsg += `💡 **Dostępne polecenia:**\n`;
      statusMsg += `• 🪙 **!firma zbierz** — odbierz pasywny zysk\n`;
      if (user.company && user.company.isBroken) {
        statusMsg += `• 🔧 **!firma napraw** — napraw pierwszą firmę\n`;
      }
      if (user.company2 && user.company2.isBroken) {
        statusMsg += `• 🔧 **!firma napraw2** — napraw drugą firmę\n`;
      }
      if (user.company) {
        statusMsg += `• 💸 **!firma sprzedaj** — sprzedaj pierwszą firmę (50% ceny)\n`;
      }
      if (user.company2) {
        statusMsg += `• 💸 **!firma sprzedaj2** — sprzedaj drugą firmę (50% ceny)\n`;
      }

      await message.reply(statusMsg);
    });
  }
};
