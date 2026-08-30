const { formatCurrency, HOUSE_TIERS, WORKSHOP_BONUSES, ARMORY_BONUSES, GYM_BONUSES, hasItem, ensureInventoryRecord } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function buildBar(lvl, maxLvl) {
  let bar = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= lvl) {
      bar += '█';
    } else if (i <= maxLvl) {
      bar += '░';
    } else {
      bar += '·';
    }
  }
  return bar;
}

module.exports = {
  name: 'dom2',
  aliases: ['mieszkanie2', 'house2'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();

    const hasLicense = await withData(store => {
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      return hasItem(inventory, 'deweloper');
    });

    if (!hasLicense) {
      await message.reply('❌ Nie posiadasz przedmiotu 🏗️ **Deweloper**, który jest wymagany do korzystania z tej komendy.');
      return;
    }

    if (action === 'kup' || action === 'buy') {
      const targetQuery = args.slice(1).join(' ');
      if (!targetQuery) {
        await message.reply('❌ Podaj nazwę drugiego domu do kupienia! Dostępne: `rudera`, `domek`, `apartament`, `willa`, `rezydencja`.');
        return;
      }

      let targetTier = null;
      for (const [tier, info] of Object.entries(HOUSE_TIERS)) {
        if (info.name.toLowerCase() === targetQuery || (targetQuery === 'rudera' && info.name === 'Rudera')) {
          targetTier = parseInt(tier);
          break;
        }
      }

      if (!targetTier) {
        await message.reply('❌ Nieznana nieruchomość. Dostępne: `rudera`, `domek`, `apartament`, `willa`, `rezydencja`.');
        return;
      }

      const targetInfo = HOUSE_TIERS[targetTier];

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.house || !user.house.tier) {
          return { error: '❌ Musisz najpierw posiadać pierwszy (główny) dom! Kup go przez **!dom kup <nazwa>**.' };
        }

        if (user.house2) {
          const currentTier2 = user.house2.tier;
          if (currentTier2 === targetTier) {
            return { error: '❌ Posiadasz już tę nieruchomość jako drugi dom!' };
          }
          if (currentTier2 > targetTier) {
            return { error: '❌ Nie możesz kupić nieruchomości o niższym standardzie niż obecny drugi dom!' };
          }
          const currentPrice = HOUSE_TIERS[currentTier2].price;
          const priceToPay = targetInfo.price - currentPrice;
          if (user.balance < priceToPay) {
            return { error: `❌ Nie stać Cię! Ta transakcja kosztuje **${formatCurrency(priceToPay)}**, a masz tylko **${formatCurrency(user.balance)}**.` };
          }
          user.balance -= priceToPay;
          user.house2.tier = targetTier;
          return { success: true, priceToPay, currentTier: currentTier2 };
        }

        const idx1 = parseInt(String(user.house.tier));
        if (targetTier >= idx1) {
          return { error: `❌ Drugi dom musi być o co najmniej jeden tier niższy niż Twój pierwszy dom (**${HOUSE_TIERS[user.house.tier].name}**).` };
        }

        const inventory = ensureInventoryRecord(store.inventory, message.author.id);
        const deweloperDiscount = hasItem(inventory, 'deweloper') ? 0.85 : 1;
        const finalPrice = Math.round(targetInfo.price * deweloperDiscount);

        if (user.balance < finalPrice) {
          return { error: `❌ Nie stać Cię! Drugi dom kosztuje **${formatCurrency(finalPrice)}**, a masz tylko **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= finalPrice;
        user.house2 = {
          tier: targetTier,
          upgrades: { warsztat: 0, zbrojownia: 0, silownia: 0 },
          lastRentPaid: Date.now()
        };

        return { success: true, priceToPay: finalPrice, currentTier: 0 };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const actionText = result.currentTier > 0 ? 'ulepszyłeś swój drugi dom do klasy' : 'kupiłeś drugą nieruchomość';
      await message.reply(`🎉 Pomyślnie ${actionText} **${targetInfo.name}** ${targetInfo.emoji} za **${formatCurrency(result.priceToPay)}**!`);
      return;
    }

    if (action === 'sprzedaj' || action === 'sell') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.house2) {
          return { error: '❌ Nie posiadasz drugiego domu do sprzedania!' };
        }

        const tierInfo = HOUSE_TIERS[user.house2.tier];
        if (!tierInfo) {
          user.house2 = null;
          return { error: '⚠️ Typ drugiego domu jest nieprawidłowy. Dom został wyczyszczony z bazy.' };
        }

        const refund = Math.floor(tierInfo.price * 0.5);
        user.balance += refund;
        delete user.house2;

        return { success: true, refund, name: tierInfo.name, emoji: tierInfo.emoji };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💸 Sprzedano drugi dom **${result.name}** ${result.emoji} za **50%** ceny zakupu: **+${formatCurrency(result.refund)}**.\n💰 Twój portfel: **${formatCurrency(result.balance)}**.`);
      return;
    }

    if (action === 'ulepsz') {
      const upgradeName = (args[1] || '').toLowerCase();
      const validUpgrades = ['warsztat', 'zbrojownia', 'silownia'];
      if (!upgradeName || !validUpgrades.includes(upgradeName)) {
        await message.reply('❌ Wpisz poprawną nazwę ulepszenia! Dostępne: `warsztat`, `zbrojownia`, `silownia` (np. `!dom2 ulepsz warsztat`).');
        return;
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        const inventory = ensureInventoryRecord(store.inventory, message.author.id);
        if (!user.house2 || !user.house2.tier) {
          return { error: '❌ Nie posiadasz drugiego domu! Najpierw kup go za pomocą `!dom2 kup`.' };
        }

        const tierInfo = HOUSE_TIERS[user.house2.tier];
        const currentLvl = (user.house2.upgrades && user.house2.upgrades[upgradeName]) || 0;

        if (currentLvl >= 5) {
          return { error: '❌ To ulepszenie osiągnęło już maksymalny poziom (poziom 5)!' };
        }

        if (currentLvl >= tierInfo.maxUpgradeLvl) {
          return { error: `❌ Osiągnąłeś limit ulepszeń (**poziom ${tierInfo.maxUpgradeLvl}**) dla klasy **${tierInfo.name}**! Kup większy dom, aby ulepszać dalej.` };
        }

        let cost = UPGRADES_COSTS[upgradeName][currentLvl];
        if (hasItem(inventory, 'deweloper')) {
          cost = Math.round(cost * 0.85);
        }
        if (user.balance < cost) {
          return { error: `❌ Brak środków! Ulepszenie na poziom **${currentLvl + 1}** kosztuje **${formatCurrency(cost)}** (posiadasz **${formatCurrency(user.balance)}**).` };
        }

        user.balance -= cost;
        user.house2.upgrades = user.house2.upgrades || { warsztat: 0, zbrojownia: 0, silownia: 0 };
        user.house2.upgrades[upgradeName] = currentLvl + 1;

        return { success: true, newLvl: currentLvl + 1, cost };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const slotEmoji = upgradeName === 'warsztat' ? '🔧' : (upgradeName === 'zbrojownia' ? '⚔️' : '🏋️');
      await message.reply(`🔨 Pomyślnie ulepszyłeś ${slotEmoji} **${upgradeName.toUpperCase()}** drugiego domu na poziom **${result.newLvl}/5** za **${formatCurrency(result.cost)}**!`);
      return;
    }

    await withData(async (store) => {
      const user = createUser(message.author.id, store.users);

      if (!user.house2) {
        await message.reply('🏚️ Nie posiadasz jeszcze drugiego domu. Wpisz `!dom2 kup <nazwa>`, aby kupić drugą nieruchomość!');
        return;
      }

      const tierInfo = HOUSE_TIERS[user.house2.tier];
      if (!tierInfo) {
        user.house2 = null;
        await message.reply('⚠️ Typ drugiego domu jest nieprawidłowy.');
        return;
      }

      const upgrades = user.house2.upgrades || { warsztat: 0, zbrojownia: 0, silownia: 0 };
      const warsztatLvl = upgrades.warsztat || 0;
      const zbrojowniaLvl = upgrades.zbrojownia || 0;
      const silowniaLvl = upgrades.silownia || 0;

      const nextRentMs = (user.house2.lastRentPaid || Date.now()) + 24 * 60 * 60 * 1000;
      const timeLeftMs = Math.max(0, nextRentMs - Date.now());
      const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

      const workBonusPct = (tierInfo.workBonus * 100).toFixed(1);
      const bonusWarsztatPct = (WORKSHOP_BONUSES[warsztatLvl] * 100).toFixed(0);
      const zbrojowniaStrengthPct = (ARMORY_BONUSES[zbrojowniaLvl].strength * 100).toFixed(0);
      const zbrojowniaLootPct = (ARMORY_BONUSES[zbrojowniaLvl].loot * 100).toFixed(0);
      const silowniaPct = (GYM_BONUSES[silowniaLvl] * 100).toFixed(0);

      let statusMsg = `🏠 **TWÓJ DRUGI DOM** 🏠\n`;
      statusMsg += `Nieruchomość: **${tierInfo.name}** ${tierInfo.emoji}\n`;
      statusMsg += `Opłacany czynsz: **${formatCurrency(Math.round(tierInfo.price * 0.10))} / 24h**\n`;
      statusMsg += `Następna płatność za: **${hours}h ${minutes}min**\n\n`;

      statusMsg += `📊 **Pasywne bonusy:**\n`;
      statusMsg += `  • +${workBonusPct}% do zarobków z pracy (\`!work\`)\n`;
      if (tierInfo.crimeCooldown > 0 || tierInfo.workCooldown > 0) {
        const cds = [];
        if (tierInfo.workCooldown > 0) cds.push(`work: -${(tierInfo.workCooldown * 100).toFixed(1)}%`);
        if (tierInfo.crimeCooldown > 0) cds.push(`crime: -${(tierInfo.crimeCooldown * 100).toFixed(1)}%`);
        statusMsg += `  • Cooldowny: ${cds.join(', ')}\n`;
      }
      if (tierInfo.bankCap > 0) {
        statusMsg += `  • Pojemność banku: +${formatCurrency(tierInfo.bankCap)}\n`;
      }

      statusMsg += `\n🛠️ **Ulepszenia (limit dla tego domu: ${tierInfo.maxUpgradeLvl}/5):**\n`;
      statusMsg += `  🔧 **Warsztat:** \`${buildBar(warsztatLvl, tierInfo.maxUpgradeLvl)}\` (lvl ${warsztatLvl}/5) -> +${bonusWarsztatPct}% do \`!work\`\n`;
      statusMsg += `  ⚔️ **Zbrojownia:** \`${buildBar(zbrojowniaLvl, tierInfo.maxUpgradeLvl)}\` (lvl ${zbrojowniaLvl}/5) -> +${zbrojowniaStrengthPct}% siły gangu, +${zbrojowniaLootPct}% łupu\n`;
      statusMsg += `  🏋️ **Siłownia:** \`${buildBar(silowniaLvl, tierInfo.maxUpgradeLvl)}\` (lvl ${silowniaLvl}/5) -> -${silowniaPct}% do cooldownów\n\n`;

      statusMsg += `👉 *Użyj \`!dom2 ulepsz <warsztat/zbrojownia/silownia>\` aby podnieść ulepszenia, lub \`!dom2 sprzedaj\` aby sprzedać dom.*`;

      await message.reply(statusMsg);
    });
  }
};
