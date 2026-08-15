const config = require('../config/config');
const { helpCommands } = require('../utils/helpSystem');

module.exports = {
  name: 'hosthelp',
  aliases: ['hostpomoc'],
  async execute(client, message, args) {
    const creatorId = '100060812419294';

    if (message.author.id !== creatorId) {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const prefix = message.prefix || '!';
    
    // Komendy dostępne tylko dla twórcy
    const creatorOnlyCommands = ['thx', 'zezwol', 'wersja', 'uadm', 'adm', 'guardnick', 'danegrpinfo', 'danegrp', 'dane', 'checkspam', 'backup', 'eventitemadd', 'eventitemdel', 'itemadd', 'gangreset', 'wymus', 'odtworz', 'stopdanegrpinfo', 'kubl', 'truebl'];
    
    const creatorCommands = helpCommands.filter(cmd => creatorOnlyCommands.includes(cmd.name));

    const sorted = [...creatorCommands].sort((a, b) => a.name.localeCompare(b.name));

    const lines = sorted.map((c, idx) => {
      return `👑 **${idx + 1}.** **${prefix}${c.name}** — ${c.shortDescription}`;
    }).join('\n');

    await message.reply(`👑 **KOMENDY TWÓRCY BOTA**\n${lines}\n\n💡 Szczegóły: \`${prefix}help <kategoria> <numer>\``);
  }
};
