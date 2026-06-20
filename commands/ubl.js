const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');
const { parseFBInput, resolveUIDFromUsername } = require('../utils/facebook');


module.exports = {
  name: 'ubl',
  aliases: ['ybl', 'unbl', 'unblacklist'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień do tej komendy.');
      return;
    }

    if (!args[0]) {
      await message.reply('❌ Podaj ID/oznacz osobę lub podaj numer/ID grupy: **!ubl @osoba**, **!ubl <id_uzytkownika>** lub **!ubl <nr_grupy>**');
      return;
    }

    const input = args[0].trim();
    const threadIds = Array.from(client.activeThreadIds || []).sort();

    // Sprawdzamy czy podano poprawny indeks grupy z listy
    const index = parseInt(input, 10);
    let targetGroupId = null;
    if (!isNaN(index) && index >= 1 && index <= threadIds.length) {
      targetGroupId = threadIds[index - 1];
    } else {
      // Sprawdzamy czy podane ID jest obecnie na liście zablokowanych grup
      const isGroupBanned = await withData(store => {
        return (store.profiles.blacklistedGroups || []).includes(input);
      });
      if (isGroupBanned) {
        targetGroupId = input;
      }
    }

    if (targetGroupId) {
      const result = await withData(store => {
        if (!store.profiles.blacklistedGroups) store.profiles.blacklistedGroups = [];
        const idx = store.profiles.blacklistedGroups.indexOf(targetGroupId);
        if (idx === -1) {
          return { notFound: true };
        }
        store.profiles.blacklistedGroups.splice(idx, 1);
        return { success: true };
      });

      if (result.notFound) {
        await message.reply(`👤 Grupa o ID **${targetGroupId}** nie znajduje się na czarnej liście.`);
        return;
      }

      await message.reply(`✅ Pomyślnie odblokowano grupę o ID **${targetGroupId}**. Bot ponownie będzie na niej odpowiadać.`);
      return;
    }

    let targetId = null;
    let targetName = 'Użytkownik';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0]) {
      const input = args.join(' ');
      const parsed = parseFBInput(input);
      if (parsed.type === 'id') {
        targetId = parsed.value;
      } else {
        const loadingMsg = await message.reply(`🔍 Rozpoznano nazwę użytkownika/link "${parsed.value}". Trwa pobieranie ID z Facebooka...`);
        try {
          targetId = await resolveUIDFromUsername(parsed.value);
        } catch (resolveErr) {
          console.error('[UBL] Błąd pobierania UID:', resolveErr);
          await message.reply(`❌ Nie udało się ustalić ID dla "${parsed.value}": ${resolveErr.message}`);
          return;
        }
      }
    }

    if (!targetId || !/^\d+$/.test(targetId)) {
      await message.reply('❌ Podaj ID, oznacz osobę lub podaj link do profilu: **!ubl @osoba**, **!ubl <id>** lub **!ubl <link>**');
      return;
    }

    if (client.userNames.has(targetId)) {
      targetName = client.userNames.get(targetId);
    } else {
      try {
        const resolvedName = await client.resolveUserName(client.api, targetId);
        if (resolvedName && !resolvedName.startsWith('Użytkownik_')) {
          targetName = resolvedName;
        } else {
          targetName = `Uzytkownik_${targetId.slice(-6)}`;
        }
      } catch (_) {
        targetName = `Uzytkownik_${targetId.slice(-6)}`;
      }
    }

    const restrictedAdmins = ['100089655356822', '61554894353095', '100053875564339'];

    const result = await withData(store => {
      if (!store.profiles.blacklist) store.profiles.blacklist = [];
      const idx = store.profiles.blacklist.indexOf(targetId);

      // Sprawdź czy użytkownik ma aktywny tymczasowy ban za spam
      const hasSpamBan = store.cooldowns.spam[targetId] 
        && typeof store.cooldowns.spam[targetId] === 'object'
        && store.cooldowns.spam[targetId].blockedUntil > Date.now();

      if (idx === -1 && !hasSpamBan) {
        return { notFound: true };
      }

      if (idx !== -1) {
        // Blokada za ujemne saldo — NIKT (nawet twórca) nie może zdjąć
        const targetUser = store.users[targetId];
        if (targetUser && targetUser.blacklistedForNegativeBalance) {
          return { isNegativeBalanceBl: true };
        }

        // Sprawdź czy target jest na twardej czarnej liście (tylko twórca może go zdjąć)
        if (store.profiles.trueBlacklist && store.profiles.trueBlacklist.includes(targetId)) {
          if (message.author.id !== '100060812419294') {
            return { isTrueBlRestricted: true };
          }
        }

        store.profiles.blacklist.splice(idx, 1);
        if (store.profiles.trueBlacklist) {
          const trueIdx = store.profiles.trueBlacklist.indexOf(targetId);
          if (trueIdx !== -1) {
            store.profiles.trueBlacklist.splice(trueIdx, 1);
          }
        }
      }

      // Wyczyść tymczasowy ban za spam
      if (store.cooldowns.spam[targetId]) {
        delete store.cooldowns.spam[targetId];
      }

      // Wyczyść licznik ostrzeżeń za spam
      if (store.profiles.spamWarnings && store.profiles.spamWarnings[targetId]) {
        delete store.profiles.spamWarnings[targetId];
      }

      // Wyczyść powiadomienia o cooldownie
      if (store.cooldowns.cooldownNotifications && store.cooldowns.cooldownNotifications[targetId]) {
        delete store.cooldowns.cooldownNotifications[targetId];
      }

      return { success: true, wasOnBlacklist: idx !== -1, hadSpamBan: hasSpamBan };
    });

    if (result.notFound) {
      await message.reply(`👤 **${targetName}** nie znajduje się na czarnej liście ani nie ma aktywnego bana za spam.`);
      return;
    }

    if (result.isNegativeBalanceBl) {
      await message.reply(`❌ Tej blokady nie można zdjąć — **${targetName}** został zablokowany automatycznie za zbyt długie ujemne saldo. Blokada jest trwała.`);
      return;
    }

    if (result.isTrueBlRestricted) {
      await message.reply(`❌ Nie posiadasz uprawnień do usuwania tego użytkownika z czarnej listy (został zablokowany przez twórcę).`);
      return;
    }

    let replyMsg = '';
    if (result.wasOnBlacklist && result.hadSpamBan) {
      replyMsg = `✅ Usunięto **${targetName}** z czarnej listy i wyczyszczono tymczasowy ban za spam.`;
    } else if (result.wasOnBlacklist) {
      replyMsg = `✅ Usunięto **${targetName}** z czarnej listy.`;
    } else {
      replyMsg = `✅ Wyczyszczono tymczasowy ban za spam dla **${targetName}**.`;
    }
    await message.reply(replyMsg);
  }
};

