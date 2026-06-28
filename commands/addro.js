const config = require('../config/config');

module.exports = {
  name: 'addro',
  aliases: [],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      return; // Brak reakcji
    }

    const addCommand = client.commands.get('add');
    if (addCommand) {
      await addCommand.execute(client, message, ['https://www.facebook.com/profile.php?id=100093902840911']);
    }
  }
};
