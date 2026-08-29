module.exports = {
  name: 'zczytajstop',
  aliases: [],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    if (!client.zczytajState || !client.zczytajState.active) {
      await message.reply('⚠️ Żadne zczytajapi nie jest aktywne.');
      return;
    }

    client.zczytajState.stopRequested = true;
    await message.reply('🛑 Wysyłam sygnał zatrzymania do zczytajapi... Postęp zostanie zapisany.');
  }
};
