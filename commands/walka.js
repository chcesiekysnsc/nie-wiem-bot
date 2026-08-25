module.exports = {
  name: 'walka',
  aliases: [],
  async execute(client, message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub !== 'dolacz') {
      await message.reply('❌ Użycie: !walka dolacz');
      return;
    }

    const threadId = message.threadID || message.rawEvent?.threadID;
    const userId = message.author.id;

    // Znajdź aktywnego superbossa
    const result = await withData(store => {
      if (!store.superbosses) {
        return { success: false, message: 'Brak aktywnych superbossów.' };
      }

      const activeBoss = Object.values(store.superbosses).find(boss => 
        boss.status === 'active' && Date.now() < boss.endTime
      );

      if (!activeBoss) {
        return { success: false, message: 'Brak aktywnych superbossów.' };
      }

      // Sprawdź czy użytkownik już dołączył
      if (activeBoss.participants[userId]) {
        return { 
          success: false, 
          message: 'Już dołączyłeś do walki z tym bossem!',
          bossName: activeBoss.name
        };
      }

      // Losuj siłę dla gracza (jak w gangach)
      const minStrength = 45;
      const maxStrength = 135;
      const strength = Math.floor(Math.random() * (maxStrength - minStrength + 1)) + minStrength;

      // Dodaj gracza do walki
      activeBoss.participants[userId] = {
        strength: strength,
        joinedAt: Date.now()
      };
      activeBoss.totalStrength += strength;

      return {
        success: true,
        bossName: activeBoss.name,
        strength: strength,
        totalStrength: activeBoss.totalStrength,
        defense: activeBoss.defense,
        reward: activeBoss.reward,
        endTime: activeBoss.endTime,
        participantsCount: Object.keys(activeBoss.participants).length
      };
    });

    if (!result.success) {
      await message.reply(`❌ ${result.message}`);
      return;
    }

    const { bossName, strength, totalStrength, defense, reward, endTime, participantsCount } = result;
    const remainingMinutes = Math.ceil((endTime - Date.now()) / (60 * 1000));

    const replyMessage = 
      `⚔️ **Dołączyłeś do walki z superbossem!** ⚔️\n\n` +
      `👹 **Boss:** ${bossName}\n` +
      `💪 **Twoja siła:** ${strength}\n` +
      `🛡️ **Obrona bossa:** ${defense}\n` +
      `⚔️ **Całkowita siła graczy:** ${totalStrength}\n` +
      `👥 **Liczba uczestników:** ${participantsCount}\n` +
      `💰 **Nagroda:** ${reward}\n` +
      `⏰ **Pozostały czas:** ${remainingMinutes} minut`;

    await message.reply(replyMessage);
  }
};

function withData(callback) {
  const { withData } = require('../utils/storage');
  return withData(callback);
}
