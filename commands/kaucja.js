const { formatCurrency, msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'kaucja',
  aliases: ['bail'],
  async execute(client, message, args) {
    client.pendingBails = client.pendingBails || new Map();
    const authorId = message.author.id;

    const targetId = (message.mentions && message.mentions.users && message.mentions.users.first()) ? message.mentions.users.first().id : (args && args[0] ? String(args[0]).trim() : null);
    if (!targetId) {
      await message.reply('❌ Podaj użytkownika: **!kaucja @użytkownik**');
      return;
    }

    if (String(targetId) === String(authorId)) {
      await message.reply('❌ Nie możesz wykupywać samego siebie.');
      return;
    }

    const bailResult = await withData(store => {
      const target = createUser(targetId, store.users);
      if (!target.jailUntil || target.jailUntil <= Date.now()) {
        return { error: '❌ Ten gracz nie przebywa obecnie w więzieniu.' };
      }

      const now = Date.now();
      const totalJailMs = 60 * 60 * 1000;
      const remainingMs = Math.max(0, target.jailUntil - now);
      const elapsedRatio = Math.max(0, Math.min(1, 1 - remainingMs / totalJailMs));
      const cost = Math.floor(150000 - elapsedRatio * (150000 - 50000));

      return {
        targetName: target.name || `Użytkownik_${String(targetId).slice(-6)}`,
        remainingMs,
        cost
      };
    });

    if (bailResult.error) {
      await message.reply(bailResult.error);
      return;
    }

    const remainingText = msToReadable(bailResult.remainingMs);

    client.pendingBails.set(authorId, {
      targetId,
      targetName: bailResult.targetName,
      cost: bailResult.cost,
      timeout: setTimeout(() => {
        client.pendingBails.delete(authorId);
      }, 60000)
    });

    await message.reply(
      '🔓 ═════ K A U C J A ═════ 🔓\n\n' +
      `👤 Więzień: **${bailResult.targetName}**\n` +
      `⏳ Pozostały czas: **${remainingText}**\n` +
      `💰 Koszt wykupu: **${formatCurrency(bailResult.cost)}**\n\n` +
      '✍️ Aby wykupić tego gracza wpisz:\n' +
      '**!kaucja**\n\n' +
      '❌ Aby anulować wpisz:\n' +
      '**!stop**\n\n' +
      '══════════════════════'
    );
  }
};
