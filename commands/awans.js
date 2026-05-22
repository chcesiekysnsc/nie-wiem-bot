const gangCommand = require('./gang');

module.exports = {
  name: 'awans',
  aliases: [],
  async execute(client, message, args) {
    // Delegate to gang command, prefixing with 'awans' subcommand
    const gangArgs = ['awans', ...args];
    await gangCommand.execute(client, message, gangArgs);
  }
};
