const {
  buildHelpDetailEmbed,
  buildHelpErrorEmbed,
  buildHelpListEmbed,
  getHelpCommandById,
  getHelpCommandByName,
  resolveCategoryInput,
  getHelpCommandByCategoryAndNumber,
  buildCategoryPromptEmbed,
  buildCategoryListEmbed
} = require('../utils/helpSystem');

module.exports = {
  name: 'help',
  aliases: ['pomoc', 'commands'],
  async execute(client, message, args) {
    const prefix = message.prefix || '!';

    // !help bez argumentów -> pytanie o kategorię, czeka na odpowiedź nadawcy
    if (!args.length) {
      client.pendingHelpCategory = client.pendingHelpCategory || new Map();
      const senderId = message.author.id;
      const threadId = message.threadID;

      const existing = client.pendingHelpCategory.get(senderId);
      if (existing) clearTimeout(existing.timeout);

      const timeout = setTimeout(() => {
        client.pendingHelpCategory.delete(senderId);
      }, 60000);

      client.pendingHelpCategory.set(senderId, { timeout, prefix, threadId });

      await message.reply({ embeds: [buildCategoryPromptEmbed(prefix)] });
      return;
    }

    const firstArg = String(args[0] || '').toLowerCase();
    const categoryKey = resolveCategoryInput(firstArg);

    // !help <kategoria> [numer]
    if (categoryKey) {
      if (categoryKey === 'ALL') {
        const secondArg = args[1];
        if (secondArg !== undefined) {
          const num = Number(secondArg);
          if (!Number.isInteger(num)) {
            await message.reply({ embeds: [buildHelpErrorEmbed()] });
            return;
          }
          const cmd = getHelpCommandById(num);
          if (!cmd) {
            await message.reply({ embeds: [buildHelpErrorEmbed()] });
            return;
          }
          await message.reply({ embeds: [buildHelpDetailEmbed(client, cmd, prefix)] });
          return;
        }
        await message.reply({ embeds: [buildHelpListEmbed(client, prefix)] });
        return;
      }

      const secondArg = args[1];
      if (secondArg !== undefined) {
        const num = Number(secondArg);
        if (!Number.isInteger(num)) {
          await message.reply({ embeds: [buildHelpErrorEmbed()] });
          return;
        }
        const cmd = getHelpCommandByCategoryAndNumber(categoryKey, num);
        if (!cmd) {
          await message.reply({ embeds: [buildHelpErrorEmbed()] });
          return;
        }
        await message.reply({ embeds: [buildHelpDetailEmbed(client, cmd, prefix)] });
        return;
      }

      await message.reply({ embeds: [buildCategoryListEmbed(categoryKey, prefix)] });
      return;
    }

    // Fallback: globalna numeracja / nazwa (istniejące zachowanie, bez zmian)
    const input = firstArg;
    const numericId = Number(input);
    const helpCommand = Number.isInteger(numericId)
      ? getHelpCommandById(numericId)
      : getHelpCommandByName(input);

    if (!helpCommand) {
      await message.reply({ embeds: [buildHelpErrorEmbed(client)] });
      return;
    }

    await message.reply({ embeds: [buildHelpDetailEmbed(client, helpCommand, prefix)] });
  }
};
