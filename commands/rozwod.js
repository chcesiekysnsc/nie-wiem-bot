const { ensureInventoryRecord, refreshBadges, formatCurrency } = require('../utils/economy');
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

      // Rozdziel wspólny bank małżeński w razie rozwodu (50% opłata rozwodowa, reszta 50/50)
      let divorcePayoutInfo = null;
      const marriageKey = [authorId, partnerId].sort().join('-');
      if (store.profiles.marriageBanks && store.profiles.marriageBanks[marriageKey]) {
        const bank = store.profiles.marriageBanks[marriageKey];
        const totalAmount = bank.balance || 0;
        if (totalAmount > 0) {
          const fee = Math.floor(totalAmount * 0.50);
          const remaining = totalAmount - fee;
          const half = Math.floor(remaining / 2);
          const remainder = remaining - (half * 2);
          user.balance += (half + remainder);
          partner.balance += half;
          divorcePayoutInfo = { totalAmount, fee, authorPayout: half + remainder, partnerPayout: half };
        }
        delete store.profiles.marriageBanks[marriageKey];
      }

      // Odśwież odznaki (usunie odznakę Married)
      refreshBadges(user, ensureInventoryRecord(store.inventory, authorId));
      refreshBadges(partner, ensureInventoryRecord(store.inventory, partnerId));

      return { success: true, partnerId, divorcePayoutInfo };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const partnerName = typeof client.resolveUserName === 'function'
      ? await client.resolveUserName(result.partnerId)
      : (client.userNames && client.userNames.get(result.partnerId)) || `Użytkownik_${result.partnerId.slice(-6)}`;

    let payoutText = '';
    if (result.divorcePayoutInfo) {
      payoutText = ` Z wspólnego banku pobrano **50% opłaty rozwodowej** (${formatCurrency(result.divorcePayoutInfo.fee)}). Pozostałą kwotę podzielono po połowie: zwrócono **${formatCurrency(result.divorcePayoutInfo.authorPayout)}** dla Ciebie oraz **${formatCurrency(result.divorcePayoutInfo.partnerPayout)}** dla partnera.`;
    }

    await message.reply(`💔 Rozwiodłeś się z **${partnerName}**.${payoutText}`);
  }
};
