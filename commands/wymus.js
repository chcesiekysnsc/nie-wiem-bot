const { withData, createUser } = require('../utils/storage');

const WORK_EVENTS = [
  { num: 1, name: 'Szef w dobrym nastroju', desc: '+50% nagrody z !work' },
  { num: 2, name: 'Potknięcie', desc: '-30% nagrody, ale -20% cooldown przez 1h' },
  { num: 3, name: 'Podwyżka', desc: '+10% do wszystkich !work przez 6h (max 50%)' },
  { num: 4, name: 'Talent', desc: 'Podwójne XP z !work' }
];

const CREATOR_ID = '100060812419294';

module.exports = {
  name: 'wymus',
  aliases: ['forcework'],
  async execute(client, message, args) {
    if (message.author.id !== CREATOR_ID) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const targetId = message.mentionedIds && message.mentionedIds.length > 0
      ? message.mentionedIds[0]
      : message.author.id;

    const action = String(args[0] || '').toLowerCase();

    if (!action) {
      const lines = WORK_EVENTS.map(e =>
        `**${e.num}.** ${e.name} — ${e.desc}`
      ).join('\n');
      await message.reply(
        `🎯 **Wymuszalne eventy !work**\n` +
        `Użyj: **!wymus <nr> [@gracz]**\n\n` +
        lines
      );
      return;
    }

    const eventNum = parseInt(action, 10);
    if (isNaN(eventNum) || eventNum < 1 || eventNum > WORK_EVENTS.length) {
      await message.reply('❌ Podaj numer eventu 1-4. Napisz **!wymus** aby zobaczyć listę.');
      return;
    }

    await withData(store => {
      store.profiles.forcedWorkEvent = store.profiles.forcedWorkEvent || {};
      store.profiles.forcedWorkEvent[targetId] = eventNum;
    });

    const targetName = targetId === message.author.id ? 'siebie' : 'wybranego gracza';
    const event = WORK_EVENTS.find(e => e.num === eventNum);
    await message.reply(
      `✅ Wymuszono event **${event.name}** dla ${targetName}.\n` +
      `Następne użycie **!work** wywoła ten event bezwarunkowo.`
    );
  }
};
