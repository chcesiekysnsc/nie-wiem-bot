const { formatCurrency, msToReadable, randomInt } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const DRUGS = {
  marihuana: {
    id: 'marihuana',
    name: '🌿 Marihuana',
    seedPrice: 30000,
    growTimeMs: 1.5 * 3600 * 1000, // 1.5h
    minYield: 1,
    maxYield: 3,
    minSellPrice: 40000,
    maxSellPrice: 55000,
    raidRisk: 0.10, // 10%
    riskText: '10% (Bezpieczna)'
  },
  amfetamina: {
    id: 'amfetamina',
    name: '🧪 Amfetamina',
    seedPrice: 60000,
    growTimeMs: 2 * 3600 * 1000, // 2h
    minYield: 1,
    maxYield: 2,
    minSellPrice: 80000,
    maxSellPrice: 120000,
    raidRisk: 0.18, // 18%
    riskText: '18% (Średnia)'
  },
  kokaina: {
    id: 'kokaina',
    name: '❄️ Kokaina',
    seedPrice: 120000,
    growTimeMs: 3 * 3600 * 1000, // 3h
    minYield: 1,
    maxYield: 2,
    minSellPrice: 150000,
    maxSellPrice: 220000,
    raidRisk: 0.28, // 28%
    riskText: '28% (Wysokie ryzyko)'
  }
};

const findDrugType = (query) => {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;
  if (DRUGS[q]) return DRUGS[q];
  if (q.includes('marih') || q.includes('zioło') || q.includes('ziolo') || q === '1') return DRUGS.marihuana;
  if (q.includes('amf') || q === '2') return DRUGS.amfetamina;
  if (q.includes('kok') || q === '3') return DRUGS.kokaina;
  return null;
};

module.exports = {
  name: 'narkotyki',
  aliases: ['narkotyk', 'zielsko', 'plantacja', 'drugs'],
  drugs: DRUGS,
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();
    const userId = message.author.id;
    const now = Date.now();

    // Check jail status
    const isJailed = await withData(store => {
      const u = store.users[userId];
      if (u && u.jailUntil && u.jailUntil > now) {
        return u.jailUntil;
      }
      return null;
    });

    if (isJailed) {
      await message.reply(`❌ Jesteś w więzieniu! Nie możesz zarządzać nielegalnym biznesem przez **${msToReadable(isJailed - now)}**.`);
      return;
    }

    // --- SUBCOMMAND: SADZ ---
    if (action === 'sadz' || action === 'sądź' || action === 'plant') {
      const drugArg = args[1];
      const drugDef = findDrugType(drugArg);

      if (!drugDef) {
        let err = `❌ Wybierz prawidłowy rodzaj uprawy!\nDostępne rodzaje:\n`;
        Object.values(DRUGS).forEach((d, idx) => {
          err += `${idx + 1}. **${d.name}** (Koszt sadzonki: **${formatCurrency(d.seedPrice)}** | Czas: ${d.growTimeMs / 3600000}h)\n`;
        });
        err += `Przykład: **!narkotyki sadz marihuana**`;
        await message.reply(err);
        return;
      }

      const result = await withData(store => {
        const user = createUser(userId, store.users);
        if (!store.profiles) store.profiles = {};
        if (!store.profiles.narkotyki) store.profiles.narkotyki = {};
        if (!store.profiles.narkotyki[userId]) {
          store.profiles.narkotyki[userId] = { plantacje: [], magazyn: { marihuana: 0, amfetamina: 0, kokaina: 0 } };
        }

        const data = store.profiles.narkotyki[userId];
        if (data.plantacje.length >= 4) {
          return { error: '❌ Posiadasz już maksymalną liczbę 4 aktywnych plantacji! Zbierz plony przed kolejnym zasadzeniem.' };
        }

        if (user.balance < drugDef.seedPrice) {
          return { error: `❌ Nie masz wystarczająco środków na sadzonkę! Cena to **${formatCurrency(drugDef.seedPrice)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= drugDef.seedPrice;
        data.plantacje.push({
          id: Date.now(),
          type: drugDef.id,
          plantedAt: now,
          readyAt: now + drugDef.growTimeMs
        });

        return { success: true, drugDef, balance: user.balance, count: data.plantacje.length };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🌱 Zasadzono: **${result.drugDef.name}** za **${formatCurrency(result.drugDef.seedPrice)}**!\n⏱️ Plony będą dojrzałe za **${msToReadable(result.drugDef.growTimeMs)}** (Aktywne plantacje: ${result.count}/4).`);
      return;
    }

    // --- SUBCOMMAND: ZBIERZ ---
    if (action === 'zbierz' || action === 'harvest') {
      const result = await withData(store => {
        if (!store.profiles || !store.profiles.narkotyki || !store.profiles.narkotyki[userId]) {
          return { error: '❌ Nie posiadasz żadnych aktywnych plantacji!' };
        }

        const data = store.profiles.narkotyki[userId];
        if (!data.plantacje || data.plantacje.length === 0) {
          return { error: '❌ Nie posiadasz żadnych aktywnych plantacji!' };
        }

        const readyList = data.plantacje.filter(p => now >= p.readyAt);
        if (readyList.length === 0) {
          const nextReady = Math.min(...data.plantacje.map(p => p.readyAt));
          return { error: `⏳ Żadna z Twoich plantacji nie jest jeszcze dojrzała! Najbliższy zbiór za **${msToReadable(nextReady - now)}**.` };
        }

        if (!data.magazyn) data.magazyn = { marihuana: 0, amfetamina: 0, kokaina: 0 };

        let harvestedInfo = [];
        data.plantacje = data.plantacje.filter(p => {
          if (now >= p.readyAt) {
            const def = DRUGS[p.type] || DRUGS.marihuana;
            const yieldCount = randomInt(def.minYield, def.maxYield);
            data.magazyn[p.type] = (data.magazyn[p.type] || 0) + yieldCount;
            harvestedInfo.push({ name: def.name, yieldCount });
            return false; // remove from active plantacje
          }
          return true; // keep in plantacje
        });

        return { success: true, harvestedInfo, magazyn: data.magazyn };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      let msg = `🌿 **ZBIÓR PLONÓW ZAKOŃCZONY SUCCESS!**\n`;
      result.harvestedInfo.forEach(h => {
        msg += `   ↳ Zebrano: **+${h.yieldCount} paczek** (${h.name})\n`;
      });
      msg += `\n📦 **Obecny stan magazynu:**\n`;
      msg += `   🌿 Marihuana: **${result.magazyn.marihuana || 0} paczek**\n`;
      msg += `   🧪 Amfetamina: **${result.magazyn.amfetamina || 0} paczek**\n`;
      msg += `   ❄️ Kokaina: **${result.magazyn.kokaina || 0} paczek**\n`;
      msg += `💡 Sprzedaj towar wpisując: **!narkotyki sprzedaj <typ> <ilość>**`;

      await message.reply(msg);
      return;
    }

    // --- SUBCOMMAND: SPRZEDAJ ---
    if (action === 'sprzedaj' || action === 'sell') {
      const drugArg = args[1];
      const countRaw = args[2] || '1';

      const drugDef = findDrugType(drugArg);
      if (!drugDef) {
        await message.reply('❌ Podaj prawidłowy typ narkotyku do sprzedaży! Przykład: **!narkotyki sprzedaj kokaina 2**');
        return;
      }

      const count = parseInt(countRaw, 10);
      if (isNaN(count) || count <= 0) {
        await message.reply('❌ Podaj prawidłową ilość paczek do sprzedaży!');
        return;
      }

      const result = await withData(store => {
        const user = createUser(userId, store.users);
        if (!store.profiles || !store.profiles.narkotyki || !store.profiles.narkotyki[userId]) {
          return { error: '❌ Twój magazyn jest pusty!' };
        }

        const data = store.profiles.narkotyki[userId];
        if (!data.magazyn) data.magazyn = { marihuana: 0, amfetamina: 0, kokaina: 0 };

        const available = data.magazyn[drugDef.id] || 0;
        if (available < count) {
          return { error: `❌ Nie posiadasz tylu paczek! Posiadasz **${available}** paczek (${drugDef.name}).` };
        }

        // Calculate potential price for this batch
        let totalVal = 0;
        for (let i = 0; i < count; i++) {
          totalVal += randomInt(drugDef.minSellPrice, drugDef.maxSellPrice);
        }

        // Check Police Raid Risk (Fixed risk per drug type - items do NOT reduce it)
        const isBusted = Math.random() < drugDef.raidRisk;

        if (isBusted) {
          // BUSTED BY POLICE
          // Confiscate current drug type batch
          data.magazyn[drugDef.id] -= count;

          // Fine: 50% of expected sale value
          const fine = Math.floor(totalVal * 0.50);
          user.balance = Math.max(0, user.balance - fine);

          // Jail: 1h 30min (90 min). Max bail fee 220,000💰
          const jailTimeMs = 90 * 60 * 1000;
          user.jailUntil = now + jailTimeMs;
          user.bailFee = Math.min(fine, 220000);

          return { busted: true, drugDef, count, fine, jailTimeMs, bailFee: user.bailFee };
        }

        // SUCCESSFUL SALE
        data.magazyn[drugDef.id] -= count;
        user.balance += totalVal;

        return { success: true, drugDef, count, totalVal, balance: user.balance };
      });

      if (result.busted) {
        await message.reply(`🚨 **NALOT POLICJI!** 🚨\nPolicja nakryła Cię na sprzedaży **${result.count} paczek (${result.drugDef.name})**!\n\n💥 **Konfiskata:** Towar przepadł!\n💸 **Grzywna:** **-${formatCurrency(result.fine)}**\n🔒 **Więzienie:** Trafiasz do aresztu na **1 godz. 30 min.**\n💡 Kaucja wyjścia wynosi: **${formatCurrency(result.bailFee)}**.`);
        return;
      }

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💰 **UDANA TRANSAKCJA!** Sprzedano **${result.count} paczek (${result.drugDef.name})** za **${formatCurrency(result.totalVal)}**!\n💳 Nowy stan portfela: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // DEFAULT: SHOW STATUS AND CATALOG
    const statusData = await withData(store => {
      if (!store.profiles || !store.profiles.narkotyki || !store.profiles.narkotyki[userId]) {
        return { plantacje: [], magazyn: { marihuana: 0, amfetamina: 0, kokaina: 0 } };
      }
      return store.profiles.narkotyki[userId];
    });

    let view = `🌿 **TAJNY BIZNES NIELEGALNY**\n`;
    view += `Uprawiaj i sprzedawaj nielegalne towary na czarnym rynku!\n\n`;

    view += `📦 **TWÓJ MAGAZYN:**\n`;
    view += `   🌿 Marihuana: **${statusData.magazyn?.marihuana || 0} paczek**\n`;
    view += `   🧪 Amfetamina: **${statusData.magazyn?.amfetamina || 0} paczek**\n`;
    view += `   ❄️ Kokaina: **${statusData.magazyn?.kokaina || 0} paczek**\n\n`;

    view += `🌱 **AKTYWNE PLANTACJE (${statusData.plantacje?.length || 0}/4):**\n`;
    if (!statusData.plantacje || statusData.plantacje.length === 0) {
      view += `   *Brak aktywnych upraw.*\n\n`;
    } else {
      statusData.plantacje.forEach((p, idx) => {
        const def = DRUGS[p.type] || DRUGS.marihuana;
        if (now >= p.readyAt) {
          view += `   ${idx + 1}. **${def.name}** — 🟢 **DOJRZAŁA!** (Użyj !narkotyki zbierz)\n`;
        } else {
          view += `   ${idx + 1}. **${def.name}** — ⏳ Dojrzeje za: **${msToReadable(p.readyAt - now)}**\n`;
        }
      });
      view += `\n`;
    }

    view += `📋 **OFERTA SADZONEK:**\n`;
    Object.values(DRUGS).forEach((d, i) => {
      view += `**${i + 1}. ${d.name}**\n`;
      view += `   ↳ Koszt: **${formatCurrency(d.seedPrice)}** | Czas: **${d.growTimeMs / 3600000}h** | Plon: **${d.minYield}-${d.maxYield} paczek**\n`;
      view += `   ↳ Cena za paczkę: **${formatCurrency(d.minSellPrice)} - ${formatCurrency(d.maxSellPrice)}**\n`;
      view += `   ↳ Stałe ryzyko nalotu: **${d.riskText}** *(Przedmioty ochronne nie działają)*\n\n`;
    });

    view += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    view += `💡 Zasądź roślinę: **!narkotyki sadz <marihuana/amfetamina/kokaina>**\n`;
    view += `💡 Zbierz plony: **!narkotyki zbierz**\n`;
    view += `💡 Sprzedaj towar: **!narkotyki sprzedaj <typ> <ilość>**`;

    await message.reply(view);
  }
};
