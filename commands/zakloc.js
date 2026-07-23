const { withData, createUser } = require('../utils/storage');
const { getGangUser } = require('./gang');

module.exports = {
  name: 'zakloc',
  aliases: ['zakłóć', 'zaklocacz', 'zakłócacz'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const targetParam = args.join(' ').trim();

    if (!targetParam) {
      await message.reply('❌ Użycie: !zakloc <nazwa gangu | ID gangu>');
      return;
    }

    const result = await withData(store => {
      const user = getGangUser(store, userId);

      if (!user.gangId || !store.profiles.gangs[user.gangId]) {
        return { error: '❌ Nie należysz do żadnego gangu.' };
      }

      const gang = store.profiles.gangs[user.gangId];
      const isBoss = user.gangRole === 'boss';
      const isDeputy = user.gangRole === 'deputy';
      if (!isBoss && !isDeputy) {
        return { error: '❌ Tylko Boss oraz Zastępcy mogą używać Zakłócacza.' };
      }

      if (!gang.bossShopItems || !gang.bossShopItems.includes('zaklocasz')) {
        return { error: '❌ Twój gang nie posiada **Zakłócacza**. Zdobyj go z 🥇 Pozłacanej Skrzynki w Bossowym Sklepie (!gang sklep).' };
      }

      const now = Date.now();
      const lastUse = gang.lastZaklocUse || 0;
      const cooldown = 48 * 60 * 60 * 1000;

      if (now - lastUse < cooldown) {
        const diffSec = Math.ceil((cooldown - (now - lastUse)) / 1000);
        const hrs = Math.floor(diffSec / 3600);
        const mins = Math.floor((diffSec % 3600) / 60);
        const secs = diffSec % 60;
        const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
        return { error: `⏱️ Gang może użyć Zakłócacza ponownie za: **${leftStr}**.` };
      }

      let targetGangId = null;
      const cleanParam = targetParam.toLowerCase();

      if (store.profiles.gangs[targetParam]) {
        targetGangId = targetParam;
      } else if (store.profiles.gangs[cleanParam]) {
        targetGangId = cleanParam;
      } else {
        const foundGang = Object.entries(store.profiles.gangs).find(
          ([id, g]) => g.name.toLowerCase() === cleanParam
        );
        if (foundGang) targetGangId = foundGang[0];
      }

      if (!targetGangId) {
        return { error: `❌ Nie znaleziono gangu o nazwie/ID **${targetParam}**.` };
      }

      const defenderGang = store.profiles.gangs[targetGangId];

      if (targetGangId === user.gangId) {
        return { error: '❌ Nie możesz użyć Zakłócacza na własnym gangie.' };
      }

      const shieldUntil = defenderGang.shieldUntil || 0;
      if (now >= shieldUntil) {
        return { error: `❌ Gang **${defenderGang.name}** nie posiada obecnie aktywnej tarczy ochronnej.` };
      }

      defenderGang.shieldUntil = 0;
      gang.lastZaklocUse = now;

      return {
        success: true,
        gangName: defenderGang.name
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`📟 **ZAKŁÓCANIE UDANE!**\n⚡ Pomyślnie zniszczono tarczę ochronną gangu **${result.gangName}**!\n🛡️ Wrogie sejfy są teraz odsłonięte na ataki.`);
  }
};
