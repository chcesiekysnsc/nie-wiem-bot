const gangCommand = require('./gang');

module.exports = {
  name: 'haracz',
  aliases: [],
  async execute(client, message, args) {
    // Delegate to gang command, prefixing with 'haracz' subcommand
    const gangArgs = ['haracz', ...args];
    await gangCommand.execute(client, message, gangArgs);
  }
};
