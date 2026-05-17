const { errorEmbed, successEmbed } = require('../utils/embeds');
const { createUser, withData } = require('../utils/storage');
const { ensureInventoryRecord, refreshBadges } = require('../utils/economy');
const { buildHelpButtons, buildHelpListEmbed } = require('../utils/helpSystem');

module.exports = client => {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) {
      return;
    }

    if (interaction.customId.startsWith('help:list:')) {
      const [, , ownerId, rawPage] = interaction.customId.split(':');
      const page = Math.max(1, Math.floor(Number(rawPage) || 1));

      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          embeds: [errorEmbed('Help', 'Ten panel pomocy nalezy do innego uzytkownika. Uzyj `!help`, aby otworzyc wlasny.')],
          ephemeral: true
        }).catch(() => null);
        return;
      }

      await interaction.update({
        embeds: [buildHelpListEmbed(client, page)],
        components: buildHelpButtons(ownerId, page)
      }).catch(() => null);
      return;
    }

    if (!interaction.customId.startsWith('marry:')) {
      return;
    }

    const [, action, requestId] = interaction.customId.split(':');
    const request = client.marriageRequests.get(requestId);

    if (!request) {
      await interaction.reply({
        embeds: [errorEmbed('Slub', 'Ta prosba wygasla albo zostala juz obsluzona.')],
        ephemeral: true
      }).catch(() => null);
      return;
    }

    if (interaction.user.id !== request.targetId) {
      await interaction.reply({
        embeds: [errorEmbed('Slub', 'Tylko oznaczona osoba moze odpowiedziec na te propozycje.')],
        ephemeral: true
      }).catch(() => null);
      return;
    }

    client.marriageRequests.delete(requestId);

    if (action === 'decline') {
      await interaction.update({
        embeds: [errorEmbed('Slub odrzucony', 'Propozycja zostala odrzucona.')],
        components: []
      }).catch(() => null);
      return;
    }

    const result = await withData(store => {
      const proposer = createUser(request.proposerId, store.users);
      const partner = createUser(request.targetId, store.users);

      if (proposer.marriedTo || partner.marriedTo) {
        return {
          ok: false,
          message: 'Jedna z osob jest juz w zwiazku.'
        };
      }

      proposer.marriedTo = request.targetId;
      partner.marriedTo = request.proposerId;
      refreshBadges(proposer, ensureInventoryRecord(store.inventory, request.proposerId));
      refreshBadges(partner, ensureInventoryRecord(store.inventory, request.targetId));

      return { ok: true };
    });

    if (!result.ok) {
      await interaction.update({
        embeds: [errorEmbed('Slub', result.message)],
        components: []
      }).catch(() => null);
      return;
    }

    await interaction.update({
      embeds: [successEmbed('Slub zawarty', `${interaction.user} zaakceptowal propozycje. Gratulacje!`)],
      components: []
    }).catch(() => null);
  });
};
