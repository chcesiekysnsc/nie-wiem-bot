const { checkCooldown, checkSpam } = require('../utils/cooldowns');
const { errorEmbed } = require('../utils/embeds');

module.exports = client => {
  client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) {
      return;
    }

    if (!message.content.startsWith(client.config.prefix)) {
      return;
    }

    const args = message.content.slice(client.config.prefix.length).trim().split(/\s+/);
    const commandName = (args.shift() || '').toLowerCase();

    if (!commandName) {
      return;
    }

    const command = client.commands.get(commandName);
    if (!command) {
      await message.reply({
        embeds: [errorEmbed('Nieznana komenda', `Komenda \`${commandName}\` nie istnieje.`)]
      }).catch(() => null);
      return;
    }

    try {
      const spamState = await checkSpam(message.author.id);
      if (spamState.blocked) {
        await message.reply({ embeds: [spamState.embed] }).catch(() => null);
        return;
      }

      const cooldownState = await checkCooldown(command.name, message.author.id);
      if (cooldownState.active) {
        await message.reply({ embeds: [cooldownState.embed] }).catch(() => null);
        return;
      }

      await command.execute(client, message, args);
    } catch (error) {
      console.error(`[COMMAND] ${commandName} failed:`, error);
      await message.reply({
        embeds: [errorEmbed('Blad komendy', 'Wystapil nieoczekiwany problem podczas wykonywania komendy.')]
      }).catch(() => null);
    }
  });
};
