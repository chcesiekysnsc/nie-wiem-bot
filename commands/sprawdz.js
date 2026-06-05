const config = require('../config/config');

module.exports = {
  name: 'sprawdz',
  aliases: ['check'],
  async execute(client, message, args) {
    const threadId = message.guild?.id;
    const senderId = message.author.id;

    // Sprawdź czy to jest prywatna wiadomość (PV)
    if (threadId !== senderId) {
      await message.reply('⚠️ **KASUJ TO!** Ta komenda służy do wysyłania ruchów w Mafii prywatnie do bota (na PV). Nie pisz tego na grupie, bo zdradzisz swoją rolę!');
      return;
    }

    if (!client.activeMafiaGames) {
      await message.reply('❌ Nie bierzesz udziału w żadnej aktywnej grze w Mafię.');
      return;
    }

    let playerGame = null;
    let playerObj = null;

    for (const game of client.activeMafiaGames.values()) {
      const p = game.players.find(pl => pl.id === senderId);
      if (p) {
        playerGame = game;
        playerObj = p;
        break;
      }
    }

    if (!playerGame) {
      await message.reply('❌ Nie bierzesz udziału w żadnej aktywnej grze w Mafię.');
      return;
    }

    if (playerGame.state !== 'night') {
      await message.reply('❌ Ruchy detektywa można wysyłać tylko w nocy.');
      return;
    }

    if (!playerObj.alive) {
      await message.reply('❌ Jako martwy gracz nie możesz wykonywać ruchów!');
      return;
    }

    if (playerObj.role !== 'Detektyw') {
      await message.reply('❌ Nie jesteś Detektywem! Ta komenda jest zarezerwowana dla Detektywa.');
      return;
    }

    const targetArg = args[0];
    if (!targetArg) {
      await message.reply('❌ Użyj: **!sprawdz <numer_gracza_z_listy>**');
      return;
    }

    const targetIdx = parseInt(targetArg) - 1;
    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= playerGame.players.length) {
      await message.reply('❌ Podaj poprawny numer gracza z listy.');
      return;
    }

    const targetPlayer = playerGame.players[targetIdx];
    if (!targetPlayer.alive) {
      await message.reply('❌ Ten gracz już nie żyje, nie ma potrzeby go sprawdzać.');
      return;
    }

    if (targetPlayer.id === senderId) {
      await message.reply('❌ Nie możesz sprawdzić samego siebie!');
      return;
    }

    playerGame.detectiveTarget = targetPlayer.id;
    await message.reply(`✅ **Zlecenie przyjęte!** Tej nocy sprawdzisz tożsamość gracza **${targetPlayer.name}**. Wyniki otrzymasz o poranku.`);
  }
};
