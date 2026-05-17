const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { errorEmbed, infoEmbed } = require('../utils/embeds');
const { ensureInventoryRecord, refreshBadges } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'marry',
  aliases: ['slub'],
  async execute(client, message) {
    const target = message.mentions.users.first();

    if (!target) {
      const status = await withData(store => {
        const user = createUser(message.author.id, store.users);
        refreshBadges(user, ensureInventoryRecord(store.inventory, message.author.id));
        return { marriedTo: user.marriedTo };
      });

      const description = status.marriedTo
        ? `Jestes w zwiazku z <@${status.marriedTo}>.`
        : 'Nie jestes jeszcze z nikim w zwiazku. Uzyj `!marry @user`.';

      await message.reply({ embeds: [infoEmbed('Status zwiazku', description)] });
      return;
    }

    if (target.bot) {
      await message.reply({
        embeds: [errorEmbed('Slub', 'Botow nie mozna poslubic.')]
      });
      return;
    }

    if (target.id === message.author.id) {
      await message.reply({
        embeds: [errorEmbed('Slub', 'Nie mozesz poslubic samego siebie.')]
      });
      return;
    }

    const validation = await withData(store => {
      const proposer = createUser(message.author.id, store.users);
      const partner = createUser(target.id, store.users);
      refreshBadges(proposer, ensureInventoryRecord(store.inventory, message.author.id));
      refreshBadges(partner, ensureInventoryRecord(store.inventory, target.id));

      if (proposer.marriedTo) {
        return {
          error: `Juz jestes w zwiazku z <@${proposer.marriedTo}>.`
        };
      }

      if (partner.marriedTo) {
        return {
          error: `${target} jest juz w zwiazku.`
        };
      }

      return { ok: true };
    });

    if (validation.error) {
      await message.reply({ embeds: [errorEmbed('Slub', validation.error)] });
      return;
    }

    const requestId = `${message.author.id}-${target.id}-${Date.now()}`;
    client.marriageRequests.set(requestId, {
      proposerId: message.author.id,
      targetId: target.id
    });

    setTimeout(() => {
      client.marriageRequests.delete(requestId);
    }, 120000).unref();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`marry:accept:${requestId}`)
        .setLabel('Akceptuj')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`marry:decline:${requestId}`)
        .setLabel('Odrzuc')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = infoEmbed('Propozycja slubu', `${message.author} chce poslubic ${target}.`)
      .addFields({ name: 'Akcja', value: `${target}, kliknij przycisk ponizej w ciagu 2 minut.`, inline: false });

    await message.reply({
      embeds: [embed],
      components: [row]
    });
  }
};
