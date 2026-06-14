const words = require('../utils/wisielecWords');

const HANGMAN_PICS = [
// 0 lives
`\`\`\`
  +---+
  |   |
  O   |
 /|\\  |
 / \\  |
      |
=========
\`\`\``,
// 1 life
`\`\`\`
  +---+
  |   |
  O   |
 /|\\  |
 /    |
      |
=========
\`\`\``,
// 2 lives
`\`\`\`
  +---+
  |   |
  O   |
 /|\\  |
      |
      |
=========
\`\`\``,
// 3 lives
`\`\`\`
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========
\`\`\``,
// 4 lives
`\`\`\`
  +---+
  |   |
  O   |
  |   |
      |
      |
=========
\`\`\``,
// 5 lives
`\`\`\`
  +---+
  |   |
  O   |
      |
      |
      |
=========
\`\`\``,
// 6 lives
`\`\`\`
  +---+
  |   |
      |
      |
      |
      |
=========
\`\`\``
];

function trackMessage(game, msgInfo) {
  if (game && msgInfo && msgInfo.messageID) {
    game.lastMessageId = msgInfo.messageID;
    if (!game.validMessageIds) {
      game.validMessageIds = [];
    }
    if (!game.validMessageIds.includes(msgInfo.messageID)) {
      game.validMessageIds.push(msgInfo.messageID);
    }
  }
}

module.exports = {
  name: 'wisielec',
  aliases: ['wisielecz', 'hangman'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko na czatach grupowych.');
      return;
    }

    if (!client.activeHangman) {
      client.activeHangman = new Map();
    }

    const action = args[0] ? args[0].toLowerCase().trim() : '';

    const game = client.activeHangman.get(threadId);

    // 1. Join Action
    if (action === 'dolacz' || action === 'dolać') {
      if (!game) {
        await message.reply('❌ Nie ma żadnej aktywnej gry w Wisielca na tej grupie. Wpisz **!wisielec**, aby utworzyć nową grę.');
        return;
      }
      if (game.status !== 'joining') {
        await message.reply('❌ Gra już się rozpoczęła, nie możesz dołączyć w trakcie.');
        return;
      }
      const isAlreadyIn = game.players.some(p => p.id === message.author.id);
      if (isAlreadyIn) {
        await message.reply(`⚠️ **${message.author.username}**, już jesteś na liście graczy.`);
        return;
      }
      game.players.push({
        id: message.author.id,
        username: message.author.username
      });
      const msgInfo = await message.reply(`✅ **${message.author.username}** dołączył do gry w Wisielca! (Łącznie graczy: **${game.players.length}**)`);
      trackMessage(game, msgInfo);
      return;
    }

    // 2. Start Action (manual start by host)
    if (action === 'start') {
      if (!game) {
        await message.reply('❌ Nie ma aktywnej gry do rozpoczęcia.');
        return;
      }
      if (game.status !== 'joining') {
        await message.reply('❌ Gra już trwa.');
        return;
      }
      if (game.hostId !== message.author.id) {
        await message.reply('❌ Tylko organizator gry (host) może rozpocząć ją wcześniej.');
        return;
      }
      if (game.players.length < 1) {
        await message.reply('❌ Musi być przynajmniej 1 gracz, aby rozpocząć grę.');
        return;
      }
      clearTimeout(game.joinTimeout);
      await this.startGame(client, message, game, threadId);
      return;
    }

    // 3. New Game creation
    if (game) {
      await message.reply('⚠️ Na tej grupie trwa już faza rejestracji lub aktywna gra w Wisielca!');
      return;
    }

    // Create game state
    const newGame = {
      active: true,
      status: 'joining',
      hostId: message.author.id,
      players: [{ id: message.author.id, username: message.author.username }],
      word: '',
      revealed: '',
      lives: 6,
      guessedLetters: [],
      currentPlayerIndex: 0,
      turnTimer: null,
      joinTimeout: null,
      validMessageIds: []
    };

    client.activeHangman.set(threadId, newGame);

    // Auto-start after 2 minutes
    newGame.joinTimeout = setTimeout(async () => {
      const g = client.activeHangman.get(threadId);
      if (g && g.status === 'joining') {
        if (g.players.length > 0) {
          await this.startGame(client, message, g, threadId);
        } else {
          client.activeHangman.delete(threadId);
          if (client.api) {
            client.api.sendMessage('⌛ Faza dołączania do gry w Wisielca minęła. Brak chętnych — gra anulowana.', threadId);
          }
        }
      }
    }, 120000);

    const announceMsg = 
      `🎮 **WISIELEC (KLASYCZNA GRA)** 🎮\n` +
      `Organizator **${message.author.username}** zaprasza do wspólnej gry!\n\n` +
      `⏱️ Masz **2 minuty** na dołączenie do gry.\n` +
      `👉 Napisz **!wisielec dolacz**, aby wziąć udział.\n` +
      `👑 Organizator może wpisać **!wisielec start**, aby zacząć od razu.`;

    const msgInfo = await message.reply(announceMsg);
    trackMessage(newGame, msgInfo);
  },

  async startGame(client, message, game, threadId) {
    // Pick random word
    const randIndex = Math.floor(Math.random() * words.length);
    game.word = words[randIndex].toLowerCase().trim();
    game.revealed = '_ '.repeat(game.word.length).trim();
    game.status = 'playing';

    const firstPlayer = game.players[0];
    
    let infoMsg = 
      `🎬 **GRA W WISIELCA ROZPOCZĘTA!** 🎬\n` +
      `Wylosowane hasło ma **${game.word.length}** liter.\n` +
      `Lista graczy: ${game.players.map(p => `**${p.username}**`).join(', ')}\n\n` +
      `${HANGMAN_PICS[game.lives]}\n` +
      `📝 Hasło: \`${game.revealed}\`\n\n` +
      `🎯 Zaczyna: **${firstPlayer.username}**! Czas na podanie litery (np. **a**) lub całego hasła: **30 sekund**!`;

    if (client.api) {
      client.api.sendMessage(infoMsg, threadId, (err, msgInfo) => {
        if (!err && msgInfo) trackMessage(game, msgInfo);
      });
    } else {
      const msgInfo = await message.reply(infoMsg);
      trackMessage(game, msgInfo);
    }

    this.resetTurnTimer(client, game, threadId);
    this.resetInactivityTimer(client, game, threadId);
  },

  resetTurnTimer(client, game, threadId) {
    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
    }
    game.turnTimer = setTimeout(async () => {
      if (game.active && game.status === 'playing') {
        const timedOutPlayer = game.players[game.currentPlayerIndex];
        // Skip player
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        const nextPlayer = game.players[game.currentPlayerIndex];

        let msg = `⏰ **${timedOutPlayer.username}** spóźnił się z odpowiedzią! Następuje pominięcie kolejki.\n\n` +
                  `🎯 Teraz kolej na: **${nextPlayer.username}**! Podaj literę lub hasło (30s).`;
        
        if (client.api) {
          client.api.sendMessage(msg, threadId, (err, msgInfo) => {
            if (!err && msgInfo) trackMessage(game, msgInfo);
          });
        }
        this.resetTurnTimer(client, game, threadId);
      }
    }, 30000);
  },

  resetInactivityTimer(client, game, threadId) {
    if (game.inactivityTimer) {
      clearTimeout(game.inactivityTimer);
    }
    game.inactivityTimer = setTimeout(async () => {
      if (game.active && game.status === 'playing') {
        if (game.turnTimer) clearTimeout(game.turnTimer);
        game.active = false;
        client.activeHangman.delete(threadId);

        const msg = `💀 **PRZEGRANA (Brak aktywności)!** W grze w Wisielca nie podano żadnej litery ani hasła przez 2.5 minuty. Gra kończy się porażką. Hasło to: **${game.word.toUpperCase()}**!`;
        if (client.api) {
          client.api.sendMessage(msg, threadId);
        }
      }
    }, 150000); // 2.5 minutes
  },

  // Handled from self_bot.js interceptor when currentPlayer types something
  async handleGuess(client, messageContext, input) {
    const threadId = messageContext.guild.id;
    const game = client.activeHangman.get(threadId);
    if (!game || !game.active || game.status !== 'playing') return;

    this.resetInactivityTimer(client, game, threadId);

    const authorId = messageContext.author.id;
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.id !== authorId) return;

    const guess = input.toLowerCase().trim();

    // 1. Word guess
    if (guess.length > 1) {
      if (guess === game.word) {
        // WINNER!
        if (game.turnTimer) clearTimeout(game.turnTimer);
        if (game.inactivityTimer) clearTimeout(game.inactivityTimer);
        game.active = false;
        client.activeHangman.delete(threadId);

        const winMsg = `🎉 **GRATULACJE!** **${currentPlayer.username}** odgadł całe hasło: **${game.word.toUpperCase()}**!\n` +
                       `🏆 Gracze wygrywają w Wisielca!`;
        await messageContext.reply(winMsg);
        return;
      } else {
        // Wrong word
        game.lives--;
        let msg = `❌ Hasło **"${guess.toUpperCase()}"** jest błędne! Tracicie 1 życie.\n` +
                  `${HANGMAN_PICS[game.lives]}\n`;

        if (game.lives <= 0) {
          if (game.turnTimer) clearTimeout(game.turnTimer);
          if (game.inactivityTimer) clearTimeout(game.inactivityTimer);
          game.active = false;
          client.activeHangman.delete(threadId);
          msg += `💀 **PRZEGRANA!** Skończyły się wam życia. Hasło to: **${game.word.toUpperCase()}**!`;
          await messageContext.reply(msg);
          return;
        } else {
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
          const nextPlayer = game.players[game.currentPlayerIndex];
          msg += `📝 Hasło: \`${game.revealed}\`\n` +
                 `🎯 Teraz kolej na: **${nextPlayer.username}**! Podaj literę lub hasło.`;
          const msgInfo = await messageContext.reply(msg);
          trackMessage(game, msgInfo);
          this.resetTurnTimer(client, game, threadId);
          return;
        }
      }
    }

    // 2. Letter guess (length === 1)
    if (game.guessedLetters.includes(guess)) {
      const msgInfo = await messageContext.reply(`⚠️ Litera **${guess.toUpperCase()}** była już podawana! Wybierz inną (kolejka nie zostaje pominięta).`);
      trackMessage(game, msgInfo);
      return;
    }

    game.guessedLetters.push(guess);

    if (game.word.includes(guess)) {
      // Correct letter
      // Re-build revealed word
      let newRevealed = '';
      for (const char of game.word) {
        if (game.guessedLetters.includes(char)) {
          newRevealed += char.toUpperCase() + ' ';
        } else {
          newRevealed += '_ ';
        }
      }
      game.revealed = newRevealed.trim();

      // Check if won
      const won = !game.revealed.includes('_');
      if (won) {
        if (game.turnTimer) clearTimeout(game.turnTimer);
        if (game.inactivityTimer) clearTimeout(game.inactivityTimer);
        game.active = false;
        client.activeHangman.delete(threadId);

        const winMsg = `🎉 **GRATULACJE!** Odgadliście hasło: **${game.word.toUpperCase()}**!\n` +
                       `🏆 Ostatnią literę **${guess.toUpperCase()}** podał **${currentPlayer.username}**!`;
        await messageContext.reply(winMsg);
        return;
      } else {
        // Game continues
        let msg = `✅ Dobrze! Litera **${guess.toUpperCase()}** znajduje się w haśle.\n` +
                  `${HANGMAN_PICS[game.lives]}\n` +
                  `📝 Hasło: \`${game.revealed}\`\n` +
                  `🔤 Podane litery: [${game.guessedLetters.map(l => l.toUpperCase()).join(', ')}]\n\n`;

        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        const nextPlayer = game.players[game.currentPlayerIndex];
        msg += `🎯 Teraz kolej na: **${nextPlayer.username}**! Podaj literę lub hasło.`;
        const msgInfo = await messageContext.reply(msg);
        trackMessage(game, msgInfo);
        this.resetTurnTimer(client, game, threadId);
        return;
      }
    } else {
      // Incorrect letter
      game.lives--;
      let msg = `❌ Zła odpowiedź! Litera **${guess.toUpperCase()}** nie znajduje się w haśle.\n` +
                `${HANGMAN_PICS[game.lives]}\n` +
                `📝 Hasło: \`${game.revealed}\`\n` +
                `🔤 Podane litery: [${game.guessedLetters.map(l => l.toUpperCase()).join(', ')}]\n\n`;

      if (game.lives <= 0) {
        if (game.turnTimer) clearTimeout(game.turnTimer);
        if (game.inactivityTimer) clearTimeout(game.inactivityTimer);
        game.active = false;
        client.activeHangman.delete(threadId);
        msg += `💀 **PRZEGRANA!** Zostaliście powieszeni. Hasło to: **${game.word.toUpperCase()}**!`;
        await messageContext.reply(msg);
        return;
      } else {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        const nextPlayer = game.players[game.currentPlayerIndex];
        msg += `🎯 Teraz kolej na: **${nextPlayer.username}**! Podaj literę lub hasło.`;
        const msgInfo = await messageContext.reply(msg);
        trackMessage(game, msgInfo);
        this.resetTurnTimer(client, game, threadId);
        return;
      }
    }
  }
};
