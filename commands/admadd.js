const config = require('../config/config');
const { errorEmbed, successEmbed, infoEmbed } = require('../utils/embeds');
const { formatCurrency, refreshBadges, ensureInventoryRecord } = require('../utils/economy');
const { addLog, logToChannel } = require('../utils/logger');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'admadd',
  aliases: ['addmoney'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply({
        embeds: [errorEmbed('Brak dostepu', 'Ta komenda jest dostepna tylko dla adminow.')]
      });
      return;
    }

    const target = message.mentions.users.first();
    const amount = Math.floor(Number(args[1]));

    if (!target || !Number.isFinite(amount) || amount <= 0) {
      await message.reply({
        embeds: [errorEmbed('Bledne uzycie', 'Uzyj: `!admadd <uid> 50000`')]
      });
      return;
    }

    const result = await withData(store => {
      const user = createUser(target.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, target.id);

      user.balance += amount;
      refreshBadges(user, inventory);

      const log = addLog(store.logs, 'admadd', {
        adminId: message.author.id,
        targetId: target.id,
        amount,
        pageId: message.guild.id,
        balanceAfter: user.balance
      });

      return {
        balance: user.balance,
        logId: log.id
      };
    });

    const embed = successEmbed('Admin Add', `${message.author} dodal ${formatCurrency(amount)} dla ${target}.`)
      .addFields(
        { name: 'Nowy balance', value: formatCurrency(result.balance), inline: true },
        { name: 'Log ID', value: `\`${result.logId}\``, inline: true }
      );

    const logEmbed = infoEmbed('Admin Log', `${message.author.tag} dodal srodki dla ${target.tag}.`)
      .addFields(
        { name: 'Kwota', value: formatCurrency(amount), inline: true },
        { name: 'User', value: target.tag, inline: false }
      );

    await logToChannel(client, logEmbed);
    await message.reply({ embeds: [embed] });
  }
};
