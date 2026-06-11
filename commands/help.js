const {
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
    const prefix = message.prefix || '!';

    if (!input) {
      await message.reply({
        embeds: [buildHelpListEmbed(client, prefix)]
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
      embeds: [buildHelpDetailEmbed(client, helpCommand, prefix)]
    });
  }
};
