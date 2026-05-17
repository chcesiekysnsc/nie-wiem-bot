const {
  buildHelpButtons,
  buildHelpDetailEmbed,
  buildHelpErrorEmbed,
  buildHelpListEmbed,
  getHelpCommandById,
  getHelpCommandByName
} = require('../utils/helpSystem');

module.exports = {
  name: 'help',
  aliases: ['pomoc', 'commands'],
  async execute(client, message, args) {
    const input = String(args[0] || '').trim().toLowerCase();

    if (!input) {
      await message.reply({
        embeds: [buildHelpListEmbed(client, 1)],
        components: buildHelpButtons(message.author.id, 1)
      });
      return;
    }

    if (input === 'page') {
      const page = Math.max(1, Math.floor(Number(args[1]) || 1));
      await message.reply({
        embeds: [buildHelpListEmbed(client, page)],
        components: buildHelpButtons(message.author.id, page)
      });
      return;
    }

    const numericId = Number(input);
    const helpCommand = Number.isInteger(numericId)
      ? getHelpCommandById(numericId)
      : getHelpCommandByName(input);

    if (!helpCommand) {
      await message.reply({
        embeds: [buildHelpErrorEmbed(client)]
      });
      return;
    }

    await message.reply({
      embeds: [buildHelpDetailEmbed(client, helpCommand)]
    });
  }
};
