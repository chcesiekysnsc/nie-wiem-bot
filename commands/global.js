const config = require('../config/config');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'global',
  aliases: [],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const targetId = String(args[0] || '').trim();
    const action = String(args[1] || '').toLowerCase();

    if (!targetId || !['on', 'off'].includes(action)) {
      await message.reply('❌ Użyj: **!global <pozycja_top/id_konta> on/off**');
      return;
    }

    let resolvedId = null;
    let resolvedName = '';

    await withData(store => {
      // 1. Sprawdź czy to jest pozycja w rankingu (np. liczba 1-100)
      if (/^\d+$/.test(targetId) && Number(targetId) > 0 && Number(targetId) <= 100) {
        const rankIndex = Number(targetId) - 1;
        const sortedUsers = Object.entries(store.users || {})
          .map(([id, u]) => ({ id, balance: (u.balance || 0) + (u.bank || 0) }))
          .sort((a, b) => b.balance - a.balance);

        if (sortedUsers[rankIndex]) {
          resolvedId = sortedUsers[rankIndex].id;
        }
      } else if (/^\d+$/.test(targetId)) {
        // 2. Jeśli to po prostu długi ID konta
        resolvedId = targetId;
      }

      if (!resolvedId) {
        return; // Brak pasującego użytkownika
      }

      if (!store.profiles.showIds) {
        store.profiles.showIds = [];
      }

      if (action === 'on') {
        if (!store.profiles.showIds.includes(resolvedId)) {
          store.profiles.showIds.push(resolvedId);
        }
      } else {
        store.profiles.showIds = store.profiles.showIds.filter(id => id !== resolvedId);
      }
    });

    if (!resolvedId) {
      await message.reply(`❌ Nie znaleziono użytkownika na pozycji/ID: **${targetId}**.`);
      return;
    }

    // Pobierz imię do odpowiedzi
    if (client.userNames.has(resolvedId)) {
      resolvedName = client.userNames.get(resolvedId);
    } else {
      resolvedName = `Użytkownik_${resolvedId.slice(-6)}`;
    }

    if (action === 'on') {
      await message.reply(`✅ Włączono pokazywanie ID dla gracza **${resolvedName}** (pozycja: **${targetId}**, ID: **${resolvedId}**) w rankingu.`);
    } else {
      await message.reply(`❌ Wyłączono pokazywanie ID dla gracza **${resolvedName}** (pozycja: **${targetId}**, ID: **${resolvedId}**) w rankingu.`);
    }
  }
};
