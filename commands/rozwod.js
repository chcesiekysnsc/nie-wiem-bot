const { ensureInventoryRecord, refreshBadges } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'rozwod',
  aliases: ['divorce'],
  async execute(client, message, args) {
    const authorId = message.author.id;

    const result = await withData(store => {
      const user = createUser(authorId, store.users);
      if (!user.marriedTo) {
        return { error: '❌ Nie jesteś w związku małżeńskim.' };
      }

      const partnerId = user.marriedTo;
      const partner = createUser(partnerId, store.users);

      // Usuń małżeństwo
      user.marriedTo = null;
      partner.marriedTo = null;

      // Odśwież odznaki (usunie odznakę Married)
      refreshBadges(user, ensureInventoryRecord(store.inventory, authorId));
      refreshBadges(partner, ensureInventoryRecord(store.inventory, partnerId));

      return { success: true, partnerId };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    let partnerName = `Użytkownik_${result.partnerId.slice(-6)}`;
    if (client.userNames.has(result.partnerId)) {
      partnerName = client.userNames.get(result.partnerId);
    }

    await message.reply(`💔 Rozwiodłeś się z **${partnerName}**.`);
  }
};
