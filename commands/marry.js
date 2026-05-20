const { ensureInventoryRecord, refreshBadges } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function getPartnerLabel(client, userId) {
  if (client.userNames.has(userId)) {
    return client.userNames.get(userId);
  }
  return `Użytkownik_${userId.slice(-6)}`;
}

module.exports = {
  name: 'marry',
  aliases: ['slub'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();

    if (!action) {
      const status = await withData(store => {
        const user = createUser(message.author.id, store.users);
        refreshBadges(user, ensureInventoryRecord(store.inventory, message.author.id));
        return { marriedTo: user.marriedTo };
      });

      if (status.marriedTo) {
        await message.reply(`💍 Status związku: Jesteś w związku z **${getPartnerLabel(client, status.marriedTo)}**.`);
      } else {
        await message.reply('💍 Status związku: Nie jesteś w żadnym związku. Użyj `!marry @osoba` lub `!marry <id>`.');
      }
      return;
    }

    if (action === 'accept' || action === 'decline') {
      let proposerId = args[1];

      if (!proposerId) {
        await message.reply('❌ Użyj: `!marry accept <id>` lub `!marry decline <id>`.');
        return;
      }

      const requestId = `${proposerId}-${message.author.id}`;
      const request = client.marriageRequests.get(requestId);

      if (!request) {
        await message.reply('❌ Brak aktywnej propozycji od tego użytkownika lub propozycja wygasła.');
        return;
      }

      client.marriageRequests.delete(requestId);

      if (action === 'decline') {
        await message.reply(`💍 Odrzuciłeś propozycję ślubu od **${getPartnerLabel(client, proposerId)}**.`);
        return;
      }

      const result = await withData(store => {
        if (store.profiles.blacklist && (store.profiles.blacklist.includes(proposerId) || store.profiles.blacklist.includes(message.author.id))) {
          return { error: '❌ Jeden z użytkowników jest zablokowany i nie można wejść z nim w interakcję.' };
        }

        const proposer = createUser(proposerId, store.users);
        const partner = createUser(message.author.id, store.users);

        if (proposer.marriedTo || partner.marriedTo) {
          return { error: '❌ Jedno z Was jest już w związku małżeńskim.' };
        }

        proposer.marriedTo = message.author.id;
        partner.marriedTo = proposerId;
        refreshBadges(proposer, ensureInventoryRecord(store.inventory, proposerId));
        refreshBadges(partner, ensureInventoryRecord(store.inventory, message.author.id));

        return { success: true };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Ślub zawarty! Jesteście teraz małżeństwem z **${getPartnerLabel(client, proposerId)}**!`);
      return;
    }

    // Proponowanie ślubu: @mention lub raw ID
    let targetId = null;
    let targetName = 'Cel';

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = args[0];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    if (!targetId) {
      await message.reply('❌ Użyj: `!marry @osoba` lub `!marry <id>`.');
      return;
    }

    if (targetId === message.author.id) {
      await message.reply('❌ Nie możesz poślubić samego siebie.');
      return;
    }

    const validation = await withData(store => {
      if (store.profiles.blacklist && store.profiles.blacklist.includes(targetId)) {
        return { error: '❌ Ten użytkownik jest zablokowany i nie możesz wchodzić z nim w interakcje.' };
      }

      const proposer = createUser(message.author.id, store.users);
      const partner = createUser(targetId, store.users);
      refreshBadges(proposer, ensureInventoryRecord(store.inventory, message.author.id));
      refreshBadges(partner, ensureInventoryRecord(store.inventory, targetId));

      if (proposer.marriedTo) {
        return { error: `❌ Jesteś już w związku z **${getPartnerLabel(client, proposer.marriedTo)}**.` };
      }

      if (partner.marriedTo) {
        return { error: `❌ **${targetName}** jest już w związku małżeńskim.` };
      }

      return { success: true };
    });

    if (validation.error) {
      await message.reply(validation.error);
      return;
    }

    const requestId = `${message.author.id}-${targetId}`;
    client.marriageRequests.set(requestId, {
      proposerId: message.author.id,
      targetId: targetId
    });

    setTimeout(() => {
      client.marriageRequests.delete(requestId);
    }, 120000).unref();

    await message.reply(`💍 Wysłano propozycję ślubu do **${targetName}**. Druga osoba musi wpisać \`!marry accept ${message.author.id}\` w ciągu 2 minut.`);
  }
};
