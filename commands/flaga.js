const { formatCurrency } = require('../utils/economy');
const config = require('../config/config');

const flagsList = [
  { emoji: '🇵🇱', answers: ['polska'], name: 'Polska' },
  { emoji: '🇩🇪', answers: ['niemcy'], name: 'Niemcy' },
  { emoji: '🇫🇷', answers: ['francja'], name: 'Francja' },
  { emoji: '🇮🇹', answers: ['wlochy', 'włochy'], name: 'Włochy' },
  { emoji: '🇪🇸', answers: ['hiszpania'], name: 'Hiszpania' },
  { emoji: '🇵🇹', answers: ['portugalia'], name: 'Portugalia' },
  { emoji: '🇬🇧', answers: ['wielka brytania', 'anglia', 'uk'], name: 'Wielka Brytania' },
  { emoji: '🇺🇸', answers: ['usa', 'stany zjednoczone', 'ameryka'], name: 'Stany Zjednoczone' },
  { emoji: '🇨🇦', answers: ['kanada'], name: 'Kanada' },
  { emoji: '🇧🇷', answers: ['brazylia'], name: 'Brazylia' },
  { emoji: '🇦🇷', answers: ['argentyna'], name: 'Argentyna' },
  { emoji: '🇯🇵', answers: ['japonia'], name: 'Japonia' },
  { emoji: '🇨🇳', answers: ['chiny'], name: 'Chiny' },
  { emoji: '🇪🇬', answers: ['egipt'], name: 'Egipt' },
  { emoji: '🇬🇷', answers: ['grecja'], name: 'Grecja' },
  { emoji: '🇹🇷', answers: ['turcja'], name: 'Turcja' },
  { emoji: '🇺🇦', answers: ['ukraina'], name: 'Ukraina' },
  { emoji: '🇷🇺', answers: ['rosja'], name: 'Rosja' },
  { emoji: '🇸🇪', answers: ['szwecja'], name: 'Szwecja' },
  { emoji: '🇳🇴', answers: ['norwegia'], name: 'Norwegia' },
  { emoji: '🇫🇮', answers: ['finlandia'], name: 'Finlandia' },
  { emoji: '🇩🇰', answers: ['dania'], name: 'Dania' },
  { emoji: '🇳🇱', answers: ['holandia', 'niderlandy'], name: 'Holandia' },
  { emoji: '🇨🇭', answers: ['szwajcaria'], name: 'Szwajcaria' },
  { emoji: '🇦🇹', answers: ['austria'], name: 'Austria' },
  { emoji: '🇧🇪', answers: ['belgia'], name: 'Belgia' },
  { emoji: '🇲🇽', answers: ['meksyk'], name: 'Meksyk' },
  { emoji: '🇮🇳', answers: ['indie'], name: 'Indie' },
  { emoji: '🇦🇺', answers: ['australia'], name: 'Australia' },
  { emoji: '🇭🇷', answers: ['chorwacja'], name: 'Chorwacja' }
];

module.exports = {
  name: 'flaga',
  aliases: [],
  flagsList,
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień administratora.');
      return;
    }

    if (!client.activeFlags) {
      client.activeFlags = new Map();
    }

    const threadId = message.guild.id;
    const randomFlag = flagsList[Math.floor(Math.random() * flagsList.length)];
    const prize = Math.floor(Math.random() * (200000 - 20000 + 1)) + 20000;

    client.activeFlags.set(threadId, {
      emoji: randomFlag.emoji,
      answers: randomFlag.answers,
      countryName: randomFlag.name,
      prize,
      active: true,
      timestamp: Date.now()
    });

    // Auto-cleanup after 20 seconds
    setTimeout(() => {
      const game = client.activeFlags.get(threadId);
      if (game && game.emoji === randomFlag.emoji && game.active) {
        client.activeFlags.delete(threadId);
        if (client.api) {
          client.api.sendMessage(`⌛ **ZGADNIJ KRAJ** ⌛\nCzas minął! Nikt nie zgadł flagi **${randomFlag.emoji}** (${randomFlag.name}) na czas.`, threadId);
        }
      }
    }, 20 * 1000).unref();

    await message.reply(
      `🏳️ **ZGADNIJ KRAJ** 🏳️\nJaki kraj reprezentuje ta flaga?\n\n` +
      `👉 **${randomFlag.emoji}**\n\n` +
      `💰 Nagroda: **${formatCurrency(prize)}**!\n` +
      `⏱️ Masz 20 sekund na odpowiedź.`
    );
  }
};
