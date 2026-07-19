const config = require('../config/config');
const { withData, createUser } = require('../utils/storage');
const { formatCurrency, hasItem, getItemQuantity, ensureInventoryRecord } = require('../utils/economy');
const {
  isUpgradeable,
  getItemUpgradeLevel,
  getUpgradeBonus,
  getNextUpgradeBonus,
  getUpgradeRequirements,
  canUpgradeItem,
  upgradeItem,
  getAllUpgradableItems,
  resolveItemId,
  getItemNumberLabel,
  formatBonusText,
  MAX_LEVEL,
  UPGRADE_MATERIALS
} = require('../utils/upgrades');

function resolveItem(input) {
  return resolveItemId(input);
}

function renderUpgradeInfo(itemId, inventoryRecord) {
  const def = config.shopItems[itemId];
  if (!def) return null;

  const currentLevel = getItemUpgradeLevel(inventoryRecord, itemId);
  const nextBonus = getNextUpgradeBonus(itemId, currentLevel);
  const reqs = getUpgradeRequirements(itemId, currentLevel);

  let text = `${def.emoji} **${def.name}** — poziom **+${currentLevel}**\n`;

  if (currentLevel > 0) {
    const currentBonus = getUpgradeBonus(itemId, currentLevel);
    text += `✅ **Aktywny bonus:** ${formatBonusText(itemId, currentBonus)}\n`;
  } else {
    text += `ℹ️ **Brak ulepszeń** — przedmiot działa na swoich bazowych statystykach.\n`;
  }

  if (currentLevel >= MAX_LEVEL) {
    text += `\n🏆 **MAKSYMALNY POZIOM OSIĄGNIĘTY**`;
    return text;
  }

  text += `\n🎯 **Następne ulepszenie (+${currentLevel + 1}):**\n`;
  text += `   • Nowy bonus: ${formatBonusText(itemId, nextBonus)}\n`;
  text += `   • Koszt: **${formatCurrency(reqs.coins)}**\n`;
  text += `   • Wymagania: 1x ${def.emoji} ${def.name} + 1x **${reqs.material}**\n`;

  return text;
}

module.exports = {
  name: 'ulepsz',
  aliases: ['upgrade', 'ulepszanie'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const input = String(args[0] || '').toLowerCase().trim();

    if (!input) {
      await message.reply(
        `🔧 **System Ulepszeń Przedmiotów**\n` +
        `Każdy przedmiot może zostać ulepszony do **+${MAX_LEVEL}**.\n\n` +
        `💡 Użycie:\n` +
        `• **!ulepsz <przedmiot>** — pokaż szczegóły ulepszenia\n` +
        `• **!ulepsz <przedmiot> potwierdz** — ulepsz przedmiot\n` +
        `• **!ulepsz lista** — lista ulepszalnych przedmiotów w ekwipunku\n\n` +
        `📦 Materiały ulepszeniowe dropują z paczek:\n` +
        `  Żelazo → Miedź → Tytan → Karbid → Inżelit\n\n` +
        `⚠️ Event przedmioty (top sezonu) nie mogą być ulepszane.`
      );
      return;
    }

    if (input === 'lista' || input === 'list') {
      const result = await withData(store => {
        const inventory = ensureInventoryRecord(store.inventory, userId);
        const items = getAllUpgradableItems(inventory);
        if (items.length === 0) {
          return { error: '❌ Nie masz żadnych ulepszalnych przedmiotów w ekwipunku.' };
        }
        const lines = items
          .map(id => {
            const def = config.shopItems[id];
            if (!def) return null;
            const lvl = getItemUpgradeLevel(inventory, id);
            const bonus = getUpgradeBonus(id, lvl);
            const bonusText = bonus ? ` — ${formatBonusText(id, bonus)}` : '';
            const numLabel = getItemNumberLabel(id);
            return `${numLabel}${def.emoji} **${def.name}** +${lvl}${bonusText}`;
          })
          .filter(Boolean);

        if (lines.length === 0) {
          return { error: '❌ Nie masz żadnych ulepszalnych przedmiotów w ekwipunku.' };
        }
        return { lines };
      });

      if (result.error) {
        await message.reply(result.error).catch(() => null);
        return;
      }

      await message.reply(
        `🔧 **TWOJE ULEPSZENIA**\n\n` +
        result.lines.join('\n') +
        `\n\n💡 Wpisz **!ulepsz <przedmiot>** aby zobaczyć szczegóły.`
      ).catch(() => null);
      return;
    }

    const confirmMode = args[1] && String(args[1]).toLowerCase().trim() === 'potwierdz';
    const itemId = resolveItem(input);

    if (!itemId) {
      await message.reply(`❌ Nie znaleziono przedmiotu o nazwie/numerze **${input}**. Wpisz **!ulepsz lista** aby zobaczyć swoje przedmioty.`);
      return;
    }

    const def = config.shopItems[itemId];
    if (!def) {
      await message.reply('❌ Ten przedmiot nie istnieje w grze.');
      return;
    }

    if (!isUpgradeable(itemId)) {
      await message.reply(`❌ Przedmiot **${def.emoji} ${def.name}** nie może być ulepszany.`);
      return;
    }

    const checkResult = await withData(store => {
      const inventory = ensureInventoryRecord(store.inventory, userId);
      return canUpgradeItem(itemId, inventory, createUser(userId, store.users).balance);
    });

    if (confirmMode) {
      const upgradeResult = await upgradeItem(userId, itemId);
      if (upgradeResult.error) {
        await message.reply(upgradeResult.error);
        return;
      }

      const newLevel = upgradeResult.newLevel;
      const bonusText = formatBonusText(itemId, upgradeResult.bonus);
      const maxed = newLevel >= MAX_LEVEL;

      let reply = `✅ **Ulepszono: ${def.emoji} ${def.name} → +${newLevel}**\n`;
      if (bonusText) {
        reply += `🎁 **Nowy bonus:** ${bonusText}\n`;
      }
      reply += `💰 Portfel: **${formatCurrency(upgradeResult.balance)}**\n`;
      reply += `🔧 Zużyto: 1x ${def.emoji} ${def.name} + 1x **${upgradeResult.materialUsed}**\n`;
      if (maxed) {
        reply += `\n🏆 **MAKSYMALNY POZIOM OSIĄGNIĘTY!**`;
      }

      await message.reply(reply);
      return;
    }

    const infoResult = await withData(store => {
      const inventory = ensureInventoryRecord(store.inventory, userId);
      return renderUpgradeInfo(itemId, inventory);
    });

    if (!infoResult) {
      await message.reply('❌ Nie można wyświetlić informacji o tym przedmiocie.');
      return;
    }

    const currentLevel = await withData(store => {
      const inventory = ensureInventoryRecord(store.inventory, userId);
      return getItemUpgradeLevel(inventory, itemId);
    });

    const reqs = getUpgradeRequirements(itemId, currentLevel);
    const canUpgrade = reqs !== null;

    let reply = `🔧 **Ulepszanie: ${def.emoji} ${def.name}**\n\n`;
    reply += infoResult + '\n';

    if (canUpgrade) {
      reply += `\n✅ **Możesz ulepszyć!**\n`;
      reply += `Potwierdź: **!ulepsz ${input} potwierdz**`;
    } else if (currentLevel >= MAX_LEVEL) {
      reply += `\n🏆 Przedmiot ma już maksymalny poziom.`;
    }

    await message.reply(reply);
  }
};
