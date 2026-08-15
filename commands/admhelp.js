const config = require('../config/config');
const {
  buildHelpDetailEmbed,
  buildHelpErrorEmbed,
  buildHelpListEmbed,
  getHelpCommandById,
  getHelpCommandByName,
  resolveCategoryInput,
  getHelpCommandByCategoryAndNumber,
  buildCategoryPromptEmbed,
  buildCategoryListEmbed,
  getCreatorHelpCommands
} = require('../utils/helpSystem');

module.exports = {
  name: 'admhelp',
  aliases: [],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień administratora.');
      return;
    }

    const prefix = message.prefix || '!';
    const adminCommands = getCreatorHelpCommands();

    const sorted = [...adminCommands].sort((a, b) => a.name.localeCompare(b.name));

    const lines = sorted.map((c, idx) => {
      return `🛡️ **${idx + 1}.** **${prefix}${c.name}** — ${c.shortDescription}`;
    }).join('\n');

    await message.reply(`🛡️ **KOMENDY ADMINISTRATORSKIE**\n${lines}\n\n💡 Szczegóły: \`${prefix}help <kategoria> <numer>\``);
  }
};
