module.exports = {
  name: 'wersja',
  aliases: ['v', 'version', 'statusbot'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Brak uprawnień.');
      return;
    }

    const buildTime = '2026-06-14 13:02';
    const description = 'Wysyłanie skonsolidowanej kopii z uploadem na Litterbox i fallbackami.';
    
    await message.reply(`🤖 **Status Bota:**\n📅 Build: \`${buildTime}\`\nℹ️ Info: ${description}\n🔌 Polaczenie: ${client.api ? 'Połączono z Messengerem' : 'Brak API'}`);
  }
};
