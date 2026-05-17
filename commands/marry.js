const { errorEmbed, infoEmbed, successEmbed } = require('../utils/embeds');
const { ensureInventoryRecord, refreshBadges } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { extractUserId } = require('../utils/messenger');

function getPartnerLabel(client, userId) {
  const partner = typeof client.getUser === 'function' ? client.getUser(userId) : null;
  return partner ? partner.tag : userId;
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

      const description = status.marriedTo
        ? `Jestes w zwiazku z ${getPartnerLabel(client, status.marriedTo)}.`
        : 'Nie jestes jeszcze z nikim w zwiazku. Uzyj `!marry <uid>`.';

      await message.reply({ embeds: [infoEmbed('Status zwiazku', description)] });
      return;
    }

    if (action === 'accept' || action === 'decline') {
      const proposerId = extractUserId(args[1]);

      if (!proposerId || proposerId === 'me') {
        await message.reply({
          embeds: [errorEmbed('Slub', 'Uzyj: `!marry accept <uid>` albo `!marry decline <uid>`.')]
        });
        return;
      }

      const requestId = `${proposerId}-${message.author.id}`;
      const request = client.marriageRequests.get(requestId);

      if (!request) {
        await message.reply({
          embeds: [errorEmbed('Slub', 'Nie znaleziono aktywnej propozycji od tego UID albo prosba wygasla.')]
        });
        return;
      }

      client.marriageRequests.delete(requestId);

      if (action === 'decline') {
        await message.reply({
          embeds: [errorEmbed('Slub odrzucony', `Odrzuciles propozycje od ${getPartnerLabel(client, proposerId)}.`)]
        });

        await client.sendText(proposerId, {
          embeds: [errorEmbed('Slub odrzucony', `${message.author.tag} odrzucil twoja propozycje.`)]
        }).catch(() => null);
        return;
      }

      const result = await withData(store => {
        const proposer = createUser(proposerId, store.users);
        const partner = createUser(message.author.id, store.users);

        if (proposer.marriedTo || partner.marriedTo) {
          return {
            ok: false,
            message: 'Jedna z osob jest juz w zwiazku.'
          };
        }

        proposer.marriedTo = message.author.id;
        partner.marriedTo = proposerId;
        refreshBadges(proposer, ensureInventoryRecord(store.inventory, proposerId));
        refreshBadges(partner, ensureInventoryRecord(store.inventory, message.author.id));

        return { ok: true };
      });

      if (!result.ok) {
        await message.reply({
          embeds: [errorEmbed('Slub', result.message)]
        });
        return;
      }

      await message.reply({
        embeds: [successEmbed('Slub zawarty', `Zaakceptowales propozycje od ${getPartnerLabel(client, proposerId)}.`)]
      });

      await client.sendText(proposerId, {
        embeds: [successEmbed('Slub zawarty', `${message.author.tag} zaakceptowal twoja propozycje.`)]
      }).catch(() => null);
      return;
    }

    const target = message.mentions.users.first();

    if (!target) {
      await message.reply({
        embeds: [errorEmbed('Slub', 'Uzyj: `!marry <uid>` albo `!marry accept <uid>`.')]
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
          error: `Juz jestes w zwiazku z ${getPartnerLabel(client, proposer.marriedTo)}.`
        };
      }

      if (partner.marriedTo) {
        return {
          error: `${target.tag} jest juz w zwiazku.`
        };
      }

      return { ok: true };
    });

    if (validation.error) {
      await message.reply({ embeds: [errorEmbed('Slub', validation.error)] });
      return;
    }

    const requestId = `${message.author.id}-${target.id}`;
    client.marriageRequests.set(requestId, {
      proposerId: message.author.id,
      targetId: target.id
    });

    setTimeout(() => {
      client.marriageRequests.delete(requestId);
    }, 120000).unref();

    const embed = infoEmbed('Propozycja slubu', `Wyslales propozycje do ${target.tag}.`)
      .addFields(
        {
          name: 'Akcja dla drugiej osoby',
          value: `Drugi gracz musi wpisac: \`${client.config.prefix}marry accept ${message.author.id}\` w ciagu 2 minut.`,
          inline: false
        }
      );

    await message.reply({
      embeds: [embed]
    });

    await client.sendText(target.id, {
      embeds: [
        infoEmbed('Nowa propozycja slubu', `${message.author.tag} chce cie poslubic.`)
          .addFields(
            { name: 'Akceptacja', value: `Wpisz \`!marry accept ${message.author.id}\``, inline: false },
            { name: 'Odrzucenie', value: `Wpisz \`!marry decline ${message.author.id}\``, inline: false }
          )
      ]
    }).catch(() => null);
  }
};
