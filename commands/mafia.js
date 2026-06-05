const config = require('../config/config');

// Mapa gier: threadId -> game state
// client.activeMafiaGames is initialized in execute if not exists
module.exports = {
  name: 'mafia',
  aliases: ['glos', 'vote'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    if (!client.activeMafiaGames) {
      client.activeMafiaGames = new Map();
    }

    const commandWord = message.content.slice(config.prefix.length).trim().split(/\s+/)[0].toLowerCase();
    const isVote = commandWord === 'glos' || commandWord === 'vote';

    // 1. Obsługa głosu w fazie dnia
    if (isVote) {
      const game = client.activeMafiaGames.get(threadId);
      if (!game) {
        await message.reply('❌ W tym wątku nie toczy się obecnie żadna gra w Mafię.');
        return;
      }

      if (game.state !== 'day') {
        await message.reply('❌ Głosować można tylko w dzień, podczas fazy narady.');
        return;
      }

      // Sprawdź czy głosujący żyje i bierze udział w grze
      const voter = game.players.find(p => p.id === message.author.id);
      if (!voter) {
        await message.reply('❌ Nie bierzesz udziału w tej grze.');
        return;
      }
      if (!voter.alive) {
        await message.reply('❌ Martwi gracze nie mogą głosować!');
        return;
      }

      const rawTarget = args[0];
      if (!rawTarget) {
        await message.reply('❌ Użyj: **!glos <numer_gracza>**');
        return;
      }

      const targetIdx = parseInt(rawTarget) - 1;
      if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= game.players.length) {
        await message.reply('❌ Podaj poprawny numer gracza z listy.');
        return;
      }

      const targetPlayer = game.players[targetIdx];
      if (!targetPlayer.alive) {
        await message.reply('❌ Ten gracz już nie żyje, nie możesz na niego głosować!');
        return;
      }

      game.votes.set(message.author.id, targetPlayer.id);
      const voterName = voter.name;
      await message.reply(`✅ **Zarejestrowano głos!** @${voterName} zagłosował na wyeliminowanie gracza **${targetPlayer.name}**.`);
      return;
    }

    // 2. Obsługa standardowej komendy !mafia
    const sub = String(args[0] || '').toLowerCase().trim();

    if (sub === 'dolacz' || sub === 'join') {
      const game = client.activeMafiaGames.get(threadId);
      if (!game) {
        await message.reply('❌ Brak aktywnej rekrutacji do Mafii. Wpisz **!mafia**, aby zacząć.');
        return;
      }

      if (game.state !== 'joining') {
        await message.reply('❌ Gra już się rozpoczęła, nie możesz dołączyć.');
        return;
      }

      if (game.players.some(p => p.id === message.author.id)) {
        await message.reply('❌ Jesteś już zapisany do gry.');
        return;
      }

      const name = message.author.username || message.author.profile?.name || `Gracz_${message.author.id.slice(-6)}`;
      game.players.push({
        id: message.author.id,
        name,
        role: null,
        alive: true
      });

      await message.reply(`✅ **@${name} dołączył do gry!** (Zapisanych: **${game.players.length}** graczy).`);
      return;
    }

    if (sub === 'status' || sub === 'lista') {
      const game = client.activeMafiaGames.get(threadId);
      if (!game) {
        await message.reply('❌ W tym wątku nie toczy się gra w Mafię.');
        return;
      }

      let msg = `🕵️ **STATUS GRY: MAFIA** 🕵️\nFaza: **${game.state === 'joining' ? 'Rekrutacja' : game.state === 'night' ? 'Noc' : 'Dzień'}**\n\nLista graczy:\n`;
      game.players.forEach((p, idx) => {
        msg += `${idx + 1}. ${p.alive ? '🟢' : '💀'} **${p.name}** ${p.alive ? '' : '*(Nie żyje)*'}\n`;
      });
      await message.reply(msg);
      return;
    }

    // Wpisanie !mafia startuje rekrutację
    const existingGame = client.activeMafiaGames.get(threadId);
    if (existingGame) {
      await message.reply('❌ Gra w tym wątku już trwa! Napisz **!mafia status** lub **!mafia dolacz**.');
      return;
    }

    const game = {
      threadId,
      state: 'joining',
      players: [],
      votes: new Map(),
      mafiaTarget: null,
      doctorTarget: null,
      detectiveTarget: null
    };

    const name = message.author.username || message.author.profile?.name || `Gracz_${message.author.id.slice(-6)}`;
    game.players.push({
      id: message.author.id,
      name,
      role: null,
      alive: true
    });

    client.activeMafiaGames.set(threadId, game);

    await message.reply(
      `🕵️ **GRA W MAFIĘ ROZPOCZĘTA!** 🕵️\n` +
      `Właściciel stołu: **@${name}**\n\n` +
      `Obecnie zbieramy chętnych! Wpisz **!mafia dolacz** w ciągu **90 sekund**, aby wziąć udział.\n` +
      `*Wymagane minimum: 4 graczy.*`
    );

    // Odliczanie do startu gry (90 sekund)
    setTimeout(async () => {
      if (game.players.length < 4) {
        client.activeMafiaGames.delete(threadId);
        await client.api.sendMessage(`❌ **Gra w Mafię odwołana** – zapisało się za mało graczy (wymagane min. 4 osoby, dołączyło: ${game.players.length}).`, threadId);
        return;
      }

      // Start gry - przydzielenie ról
      const players = game.players;
      const total = players.length;

      // 1. Ustal liczbę ról
      const mafiaCount = Math.max(1, Math.floor(total / 4));
      const detectiveCount = 1;
      const doctorCount = total >= 5 ? 1 : 0;

      // Stworzenie puli ról
      const rolePool = [];
      for (let i = 0; i < mafiaCount; i++) rolePool.push('Mafia');
      for (let i = 0; i < detectiveCount; i++) rolePool.push('Detektyw');
      for (let i = 0; i < doctorCount; i++) rolePool.push('Lekarz');
      while (rolePool.length < total) rolePool.push('Mieszkaniec');

      // Shuffle ról
      for (let i = rolePool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
      }

      // Przypisanie ról i wysłanie wiadomości prywatnych
      for (let i = 0; i < total; i++) {
        players[i].role = rolePool[i];
        
        let roleInfo = '';
        if (rolePool[i] === 'Mafia') {
          roleInfo = `🕵️ **Twój tajny status w grze Mafia: jesteś MAFIĄ!**\n` +
                     `Tej nocy musisz zabić jednego gracza. Gdy bot ogłosi NOC, odpisz na tę wiadomość wpisując:\n` +
                     `👉 **!kill <numer_gracza>**\n\n` +
                     `*⚠️ WAŻNE: Komendy wysyłaj wyłącznie tutaj w PM. Wpisanie ich na grupie zdradzi Twój status!*`;
        } else if (rolePool[i] === 'Detektyw') {
          roleInfo = `🔎 **Twój tajny status w grze Mafia: jesteś DETEKTYWEM!**\n` +
                     `Tej nocy możesz sprawdzić tożsamość jednego gracza. Gdy bot ogłosi NOC, odpisz na tę wiadomość wpisując:\n` +
                     `👉 **!sprawdz <numer_gracza>**\n\n` +
                     `*⚠️ WAŻNE: Komendy wysyłaj wyłącznie tutaj w PM. Wpisanie ich na grupie zdradzi Twój status!*`;
        } else if (rolePool[i] === 'Lekarz') {
          roleInfo = `🩺 **Twój tajny status w grze Mafia: jesteś LEKARZEM!**\n` +
                     `Tej nocy możesz uleczyć/zabezpieczyć jednego gracza przed śmiercią. Odpisz na tę wiadomość wpisując:\n` +
                     `👉 **!ulecz <numer_gracza>**\n\n` +
                     `*⚠️ WAŻNE: Komendy wysyłaj wyłącznie tutaj w PM. Wpisanie ich na grupie zdradzi Twój status!*`;
        } else {
          roleInfo = `👤 **Twój tajny status w grze Mafia: jesteś MIESZKAŃCEM!**\n` +
                     `Twoim zadaniem jest przetrwać i wytypować oraz powiesić mafię podczas dziennego głosowania.\n` +
                     `W nocy śpisz i nie wykonujesz żadnych ruchów.`;
        }

        try {
          client.api.sendMessage(roleInfo, players[i].id, (err) => {
            if (err) {
              console.error(`[MAFIA] Error sending PM to player ${players[i].id} (${players[i].name}):`, err);
            }
          });
        } catch (pmErr) {
          console.error(`[MAFIA] Sync error sending PM to user ${players[i].id}:`, pmErr.message);
        }
      }

      await client.api.sendMessage(
        '🎮 **Role zostały rozdane! Bot wysłał każdemu prywatną wiadomość (PV).**\n\n' +
        '⚠️ **WAŻNE (Jeśli nie widzisz wiadomości):**\n' +
        '1. **Dodaj konto bota do znajomych** na Facebooku (wtedy wiadomości trafiają bezpośrednio z powiadomieniem).\n' +
        '2. Sprawdź folder **Inne / Spam / Wiadomości od nieznajomych (Message Requests)** w aplikacji Messenger i zaakceptuj zaproszenie do konwersacji!',
        threadId
      );
      
      // Start pierwszej nocy
      await startNightPhase(client, game);
    }, 90000); // 1.5 minuty
  }
};

// Start fazy nocy
async function startNightPhase(client, game) {
  game.state = 'night';
  game.mafiaTarget = null;
  game.doctorTarget = null;
  game.detectiveTarget = null;

  let playerListStr = '';
  game.players.forEach((p, idx) => {
    playerListStr += `${idx + 1}. ${p.alive ? '🟢' : '💀'} **${p.name}**\n`;
  });

  await client.api.sendMessage(
    `🌌 **Nastała noc... Wszyscy mieszkańcy zasypiają.** 🌌\n` +
    `Mafia, Detektyw oraz Lekarz mają **45 sekund** na wysłanie swoich ruchów do bota w wiadomościach prywatnych.\n\n` +
    `Lista graczy:\n${playerListStr}`,
    game.threadId
  );

  // Czas nocy (45 sekund)
  setTimeout(async () => {
    // 1. Sprawdzenie zabójstw nocy
    let killedPlayerName = 'Nikt';
    let targetKilled = false;

    if (game.mafiaTarget) {
      if (game.mafiaTarget === game.doctorTarget) {
        targetKilled = false;
      } else {
        const victim = game.players.find(p => p.id === game.mafiaTarget);
        if (victim && victim.alive) {
          victim.alive = false;
          killedPlayerName = victim.name;
          targetKilled = true;
        }
      }
    }

    // 2. Wysłanie wyniku śledztwa detektywowi
    if (game.detectiveTarget) {
      const detective = game.players.find(p => p.role === 'Detektyw');
      const target = game.players.find(p => p.id === game.detectiveTarget);
      if (detective && detective.alive && target) {
        const identity = target.role === 'Mafia' ? 'MAFIĄ 🕵️' : 'MIESZKAŃCEM/LEKARZEM 👤';
        client.api.sendMessage(`🔎 Wynik Twojego śledztwa: Gracz **${target.name}** jest **${identity}**!`, detective.id, (err) => {
          if (err) {
            console.error(`[MAFIA] Error sending detective PM to ${detective.id}:`, err);
          }
        });
      }
    }

    // 3. Informacja o poranku
    let morningMsg = `🌅 **Nastał dzień! Wszyscy mieszkańcy się budzą.** 🌅\n`;
    if (targetKilled) {
      morningMsg += `💀 Złe wieści... Tej nocy Mafia zamordowała gracza **@${killedPlayerName}**!`;
    } else {
      morningMsg += `🛡️ Dobra noc! Lekarz uratował niedoszłą ofiarę lub Mafia nie podjęła decyzji – nikt nie zginął!`;
    }

    await client.api.sendMessage(morningMsg, game.threadId);

    // 4. Sprawdzenie warunków końca gry
    if (await checkWinConditions(client, game)) {
      return;
    }

    // 5. Start fazy dnia
    await startDayPhase(client, game);
  }, 45000); // 45 sekund
}

// Start fazy dnia (Głosowanie)
async function startDayPhase(client, game) {
  game.state = 'day';
  game.votes.clear();

  let playerListStr = '';
  game.players.forEach((p, idx) => {
    playerListStr += `${idx + 1}. ${p.alive ? '🟢' : '💀'} **${p.name}**\n`;
  });

  await client.api.sendMessage(
    `💬 **Rozpoczyna się narada mieszkańców!** 💬\n` +
    `Macie **60 sekund** na dyskusję i wytypowanie podejrzanego.\n` +
    `Głosujcie na czacie grupowym komendą: **!glos <numer_gracza>**.\n\n` +
    `Żyjący uczestnicy:\n${playerListStr}`,
    game.threadId
  );

  // Głosowanie trwa 60 sekund
  setTimeout(async () => {
    // Policz głosy
    const voteCounts = {}; // targetId -> count
    for (const targetId of game.votes.values()) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    let maxVotes = 0;
    let hangedId = null;
    let tie = false;

    for (const [targetId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        hangedId = targetId;
        tie = false;
      } else if (count === maxVotes) {
        tie = true;
      }
    }

    if (maxVotes === 0 || tie) {
      await client.api.sendMessage('⚖️ **Głosowanie zakończone**: Mieszkańcy nie doszli do porozumienia. Nikt nie zostaje wyeliminowany.', game.threadId);
    } else {
      const hangedPlayer = game.players.find(p => p.id === hangedId);
      hangedPlayer.alive = false;
      await client.api.sendMessage(
        `⚖️ **Wyrok wykonany!** Decyzją większości mieszkańców powieszono gracza **@${hangedPlayer.name}**.\n` +
        `Jego tożsamość to: **${hangedPlayer.role}**!`,
        game.threadId
      );
    }

    // Sprawdzenie wygranej po dniu
    if (await checkWinConditions(client, game)) {
      return;
    }

    // Następna noc
    await startNightPhase(client, game);
  }, 60000); // 60 sekund
}

// Sprawdzenie warunków końca gry
async function checkWinConditions(client, game) {
  const alivePlayers = game.players.filter(p => p.alive);
  const mafiaAlive = alivePlayers.filter(p => p.role === 'Mafia').length;
  const citizensAlive = alivePlayers.length - mafiaAlive;

  if (mafiaAlive === 0) {
    // Mieszkańcy wygrywają
    await client.api.sendMessage(
      `🎉 **MIESZKAŃCY WYGRYWAJĄ!** 🎉\n` +
      `Mafia została całkowicie wyeliminowana! Gratulacje dla uczciwych obywateli.`,
      game.threadId
    );
    client.activeMafiaGames.delete(game.threadId);
    return true;
  }

  if (mafiaAlive >= citizensAlive) {
    // Mafia wygrywa
    const mafiaNames = game.players.filter(p => p.role === 'Mafia').map(p => p.name).join(', ');
    await client.api.sendMessage(
      `🎉 **MAFIA WYGRYWA!** 🎉\n` +
      `Zdobyli przewagę liczebną i przejęli kontrolę nad miastem!\n` +
      `Skład Mafii: **${mafiaNames}**`,
      game.threadId
    );
    client.activeMafiaGames.delete(game.threadId);
    return true;
  }

  return false;
}
