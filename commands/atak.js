const gangCommand = require('./gang');

module.exports = {
  name: 'atak',
  aliases: ['wojna'],
  async execute(client, message, args) {
    // Delegate to gang command, prefixing with 'atak' subcommand
    const gangArgs = ['atak', ...args];
    await gangCommand.execute(client, message, gangArgs);
  }
};
