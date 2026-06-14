module.exports = {
  name: 'wersja',
  aliases: ['v', 'version', 'statusbot'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Brak uprawnień.');
      return;
    }

    const buildTime = '2026-06-14 12:37';
    const description = 'Wersja z limitem czasu kopii (12s) i fallbackiem tekstowym.';
    
    await message.reply(`🤖 **Status Bota:**\n📅 Build: \`${buildTime}\`\nℹ️ Info: ${description}\n🔌 Polaczenie: ${client.api ? 'Połączono z Messengerem' : 'Brak API'}`);
  }
};
