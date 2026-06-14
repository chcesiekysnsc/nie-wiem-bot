module.exports = {
  name: 'wersja',
  aliases: ['v', 'version', 'statusbot'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';
    if (message.author.id !== creatorId) {
      await message.reply('❌ Brak uprawnień.');
      return;
    }

    const buildTime = '2026-06-14 12:40';
    const description = 'Wysyłanie kopii czystym tekstem (bez załączników) z bezpiecznym safeSend.';
    
    await message.reply(`🤖 **Status Bota:**\n📅 Build: \`${buildTime}\`\nℹ️ Info: ${description}\n🔌 Polaczenie: ${client.api ? 'Połączono z Messengerem' : 'Brak API'}`);
  }
};
