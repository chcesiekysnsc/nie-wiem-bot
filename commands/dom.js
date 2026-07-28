const { formatCurrency, HOUSE_TIERS, WORKSHOP_BONUSES, ARMORY_BONUSES, GYM_BONUSES } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const UPGRADES_COSTS = {
  warsztat: [50000, 100000, 200000, 400000, 800000],
  zbrojownia: [75000, 150000, 300000, 600000, 1200000],
  silownia: [60000, 120000, 240000, 480000, 960000]
};

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
  name: 'dom',
  aliases: ['mieszkanie', 'house'],
  async execute(client, message, args) {
    const authorId = message.author.id;
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'rynek') {
      let reply = '🏥 **RYNEK NIERUCHOMOŚCI** 🏥\n\n';
      for (const [tier, info] of Object.entries(HOUSE_TIERS)) {
        reply += `${info.emoji} **${info.name}** — **${formatCurrency(info.price)}**\n`;
        reply += `  • *Bonus:* +${(info.workBonus * 100).toFixed(1)}% do \`!work\`\n`;
        if (info.crimeCooldown > 0) {
          reply += `  • *Skrócenie cooldownu:* -${(info.crimeCooldown * 100).toFixed(1)}% dla \`!crime\`\n`;
        }
        if (info.workCooldown > 0) {
          reply += `  • *Skrócenie cooldownu:* -${(info.workCooldown * 100).toFixed(1)}% dla \`!work\`\n`;
        }
        if (info.bankCap > 0) {
          reply += `  • *Wielkość banku:* +${formatCurrency(info.bankCap)}\n`;
        }
        reply += `  • *Limit poziomu ulepszeń:* **${info.maxUpgradeLvl}**\n\n`;
      }
      reply += '👉 *Kup nową posiadłość wpisując `!dom kup <nazwa>` (np. `!dom kup domek`). Jeśli już masz dom, płacisz tylko różnicę cen!*';
      await message.reply(reply);
      return;
    }

    if (sub === 'kup') {
      const targetName = (args[1] || '').toLowerCase();
      if (!targetName) {
        await message.reply('❌ Wpisz nazwę domu, który chcesz kupić! Dostępne: `rudera`, `domek`, `apartament`, `willa`, `rezydencja`.');
        return;
      }

      // Znajdź tier po nazwie
      let targetTier = null;
      for (const [tier, info] of Object.entries(HOUSE_TIERS)) {
        if (info.name.toLowerCase() === targetName || (targetName === 'rudera' && info.name === 'Rudera')) {
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
        const user = createUser(authorId, store.users);
        const currentTier = (user.house && user.house.tier) || 0;

        if (currentTier === targetTier) {
          return { error: '❌ Posiadasz już tę nieruchomość!' };
        }
        if (currentTier > targetTier) {
          return { error: '❌ Nie możesz kupić nieruchomości o niższym standardzie niż obecna!' };
        }

        const currentPrice = currentTier > 0 ? HOUSE_TIERS[currentTier].price : 0;
        const priceToPay = targetInfo.price - currentPrice;

        if (user.balance < priceToPay) {
          return { error: `❌ Nie stać Cię! Ta transakcja kosztuje **${formatCurrency(priceToPay)}**, a masz tylko **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= priceToPay;
        if (!user.house) {
          user.house = {
            tier: targetTier,
            upgrades: { warsztat: 0, zbrojownia: 0, silownia: 0 },
            lastRentPaid: Date.now()
          };
        } else {
          user.house.tier = targetTier;
        }

        return { success: true, priceToPay, currentTier };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const actionText = result.currentTier > 0 ? 'ulepszyłeś swój dom do klasy' : 'kupiłeś nieruchomość';
      await message.reply(`🎉 Pomyślnie ${actionText} **${targetInfo.name}** ${targetInfo.emoji} za **${formatCurrency(result.priceToPay)}**!`);
      return;
    }

    if (sub === 'ulepsz') {
      const upgradeName = (args[1] || '').toLowerCase();
      const validUpgrades = ['warsztat', 'zbrojownia', 'silownia'];
      if (!upgradeName || !validUpgrades.includes(upgradeName)) {
        await message.reply('❌ Wpisz poprawną nazwę ulepszenia! Dostępne: `warsztat`, `zbrojownia`, `silownia` (np. `!dom ulepsz warsztat`).');
        return;
      }

      const result = await withData(store => {
        const user = createUser(authorId, store.users);
        if (!user.house || !user.house.tier) {
          return { error: '❌ Nie posiadasz żadnego domu! Najpierw kup nieruchomość za pomocą `!dom kup`.' };
        }

        const tierInfo = HOUSE_TIERS[user.house.tier];
        const currentLvl = (user.house.upgrades && user.house.upgrades[upgradeName]) || 0;

        if (currentLvl >= 5) {
          return { error: '❌ To ulepszenie osiągnęło już maksymalny poziom (poziom 5)!' };
        }

        if (currentLvl >= tierInfo.maxUpgradeLvl) {
          return { error: `❌ Osiągnąłeś limit ulepszeń (**poziom ${tierInfo.maxUpgradeLvl}**) dla klasy **${tierInfo.name}**! Kup większy dom, aby ulepszać dalej.` };
        }

        const cost = UPGRADES_COSTS[upgradeName][currentLvl];
        if (user.balance < cost) {
          return { error: `❌ Brak środków! Ulepszenie na poziom **${currentLvl + 1}** kosztuje **${formatCurrency(cost)}** (posiadasz **${formatCurrency(user.balance)}**).` };
        }

        user.balance -= cost;
        user.house.upgrades = user.house.upgrades || { warsztat: 0, zbrojownia: 0, silownia: 0 };
        user.house.upgrades[upgradeName] = currentLvl + 1;

        return { success: true, newLvl: currentLvl + 1, cost };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const slotEmoji = upgradeName === 'warsztat' ? '🔧' : (upgradeName === 'zbrojownia' ? '⚔️' : '🏋️');
      await message.reply(`🔨 Pomyślnie ulepszyłeś ${slotEmoji} **${upgradeName.toUpperCase()}** na poziom **${result.newLvl}/5** za **${formatCurrency(result.cost)}**!`);
      return;
    }

    if (sub === 'sprzedaj') {
      const result = await withData(store => {
        const user = createUser(authorId, store.users);
        if (!user.house || !user.house.tier) {
          return { error: '❌ Nie posiadasz żadnego domu do sprzedania!' };
        }

        const tierInfo = HOUSE_TIERS[user.house.tier];
        const refund = Math.floor(tierInfo.price * 0.50);

        user.balance = (user.balance || 0) + refund;
        delete user.house;

        return { success: true, refund, name: tierInfo.name, emoji: tierInfo.emoji };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💰 Sprzedałeś swoją nieruchomość **${result.name}** ${result.emoji} za **50%** ceny rynkowej: **+${formatCurrency(result.refund)}**!`);
      return;
    }

    // Default: Status
    const user = await withData(store => {
      return createUser(authorId, store.users);
    });

    if (!user.house || !user.house.tier) {
      await message.reply('🏚️ Nie posiadasz jeszcze żadnej nieruchomości. Wpisz `!dom rynek`, aby zobaczyć oferty kupna!');
      return;
    }

    const tierInfo = HOUSE_TIERS[user.house.tier];
    const upgrades = user.house.upgrades || { warsztat: 0, zbrojownia: 0, silownia: 0 };

    const warsztatLvl = upgrades.warsztat || 0;
    const zbrojowniaLvl = upgrades.zbrojownia || 0;
    const silowniaLvl = upgrades.silownia || 0;

    const nextRentMs = (user.house.lastRentPaid || Date.now()) + 24 * 60 * 60 * 1000;
    const timeLeftMs = Math.max(0, nextRentMs - Date.now());
    const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

    // Mnożniki opisów
    const workBonusPct = (tierInfo.workBonus * 100).toFixed(1);
    const bonusWarsztatPct = (WORKSHOP_BONUSES[warsztatLvl] * 100).toFixed(0);
    const zbrojowniaStrengthPct = (ARMORY_BONUSES[zbrojowniaLvl].strength * 100).toFixed(0);
    const zbrojowniaLootPct = (ARMORY_BONUSES[zbrojowniaLvl].loot * 100).toFixed(0);
    const silowniaPct = (GYM_BONUSES[silowniaLvl] * 100).toFixed(0);

    let statusMsg = `🏰 **TWÓJ DOM** 🏰\n`;
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

    statusMsg += `👉 *Użyj \`!dom ulepsz <warsztat/zbrojownia/silownia>\` aby podnieść ulepszenia, lub \`!dom rynek\` aby przejrzeć inne domy.*`;

    await message.reply(statusMsg);
  }
};
