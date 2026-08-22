const { formatCurrency, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const questions = require('../utils/milionerzyQuestions');

module.exports = {
  name: 'milionerzy',
  aliases: ['mili', 'quiz'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    if (!args[0]) {
      await message.reply('❌ Podaj stawkę gry: **!milionerzy <stawka>**');
      return;
    }

    // Initialize activeMilionerzy if not exists
    if (!client.activeMilionerzy) {
      client.activeMilionerzy = new Map();
    }

    // Check if there is already an active game in this thread
    if (client.activeMilionerzy.has(threadId)) {
      await message.reply('⚠️ Na tej grupie trwa już aktywna gra w Milionerów! Poczekaj na jej zakończenie.');
      return;
    }

    if (client.taxWarningActive) {
      await message.reply('❌ Za 15 sekund nastąpi pobór podatków. Nie można rozpocząć nowej gry.');
      return;
    }

    // Resolve amount and check player's balance
    const hostId = message.author.id;
    let balance = 0;
    
    await withData(store => {
      const user = createUser(hostId, store.users);
      balance = user.balance || 0;
    });

    const wager = resolveAmount(args[0], balance);
    if (!wager || wager < 10000) {
      await message.reply('❌ Minimalna stawka do zorganizowania gry to **10 000 viccoinów**.');
      return;
    }

    if (balance < wager) {
      await message.reply(`❌ Nie masz wystarczająco pieniędzy w portfelu! Twój balans: **${formatCurrency(balance)}**`);
      return;
    }

    // Deduct wager from host
    await withData(store => {
      const user = createUser(hostId, store.users);
      user.balance -= wager;
    });

    // Select a random question
    const qIndex = Math.floor(Math.random() * questions.length);
    const question = questions[qIndex];

    const gameId = Math.random().toString(36).substring(2, 9);
    
    client.activeMilionerzy.set(threadId, {
      gameId,
      prize: wager,
      correctAnswer: question.a,
      hostId,
      active: true,
      timestamp: Date.now()
    });

    // Clean up after 15 seconds
    setTimeout(() => {
      const game = client.activeMilionerzy.get(threadId);
      if (game && game.gameId === gameId && game.active) {
        client.activeMilionerzy.delete(threadId);
        if (client.api) {
          client.api.sendMessage(
            `⌛ **MILIONERZY** ⌛\n` +
            `Czas minął! Nikt nie podał poprawnej odpowiedzi na czas. Poprawna odpowiedź to: **${question.a}**.\n` +
            `Stawka organizatora (**${formatCurrency(wager)}**) przepadła!`, 
            threadId
          );
        }
      }
    }, 15000);

    const questionText = 
      `❓ **MILIONERZY (QUIZ WIEDZY)** ❓\n` +
      `Organizator **${message.author.username || 'Gracz'}** postawił pulę: **${formatCurrency(wager)}**\n` +
      `Kto pierwszy odpowie poprawnie (wpisując samo **A**, **B**, **C** lub **D**), wygrywa pulę (minus 5% podatku)!\n\n` +
      `⏱️ Czas na odpowiedź: **15 sekund**\n` +
      `*(Organizator nie może brać udziału)*\n\n` +
      `📝 **PYTANIE:**\n` +
      `**${question.q}**\n\n` +
      `${question.o.join('\n')}`;

    await message.reply(questionText);
  }
};
