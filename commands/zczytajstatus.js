module.exports = {
  name: 'zczytajstatus',
  aliases: ['zczytajstat', 'zs'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const state = client.zczytajState;

    if (!state || !state.active) {
      await message.reply('❌ Obecnie bot nie wykonuje żadnego zczytywania historii grup.');
      return;
    }

    const elapsedMs = Date.now() - state.startedAt;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const progressPercent = state.totalGroups > 0 
      ? Math.round((state.currentGroupIndex / state.totalGroups) * 100) 
      : 0;

    const statusMsg = 
      `📊 **Status trwającego zczytywania historii:**\n` +
      `• Stan: **W toku** ⏳\n` +
      `• Zeskanowano grup: **${state.currentGroupIndex}** / **${state.totalGroups}** (${progressPercent}%)\n` +
      `• Przeanalizowano wiadomości: **${state.totalMessagesScanned.toLocaleString('pl-PL')}**\n` +
      `• Czas trwania: **${timeStr}**\n\n` +
      `*Bot przesyła regularne raporty postępu na grupę, w której uruchomiono zczytywanie.*`;

    await message.reply(statusMsg);
  }
};
