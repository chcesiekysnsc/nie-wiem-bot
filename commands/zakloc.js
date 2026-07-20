const config = require('../config/config');
const { withData, createUser } = require('../utils/storage');
const { ensureInventoryRecord, hasItem } = require('../utils/economy');

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
      const inventory = ensureInventoryRecord(store.inventory, userId);
      
      // 1. Sprawdź czy użytkownik ma przedmiot
      if (!hasItem(inventory, 'zaklocasz')) {
        return { error: '❌ Nie posiadasz urządzenia **Zakłócacz** (możesz go zdobyć z 🟦 Diamentowej Paczki).' };
      }

      // 2. Sprawdź cooldown 48h
      const user = createUser(userId, store.users);
      const now = Date.now();
      const lastUse = user.lastZaklocTime || 0;
      const cooldown = 48 * 60 * 60 * 1000;

      if (now - lastUse < cooldown) {
        const diffSec = Math.ceil((cooldown - (now - lastUse)) / 1000);
        const hrs = Math.floor(diffSec / 3600);
        const mins = Math.floor((diffSec % 3600) / 60);
        const secs = diffSec % 60;
        const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
        return { error: `⏱️ Możesz użyć Zakłócacza ponownie za: **${leftStr}**.` };
      }

      // 3. Znajdź gang przeciwnika
      let targetGangId = null;
      const cleanParam = targetParam.toLowerCase();

      if (store.profiles.gangs[cleanParam]) {
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

      // 4. Sprawdź czy gang ma tarczę ochronną
      const shieldUntil = defenderGang.shieldUntil || 0;
      if (now >= shieldUntil) {
        return { error: `❌ Gang **${defenderGang.name}** nie posiada obecnie aktywnej tarczy ochronnej.` };
      }

      // 5. Usuń tarczę ochronną i nałóż cooldown
      defenderGang.shieldUntil = 0;
      user.lastZaklocTime = now;

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
