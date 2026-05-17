const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  randomInt,
  refreshBadges,
  removeItem
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'rob',
  aliases: [],
  async execute(client, message) {
    const target = message.mentions.users.first();

    if (!target) {
      await message.reply({
        embeds: [errorEmbed('Rob', 'Uzyj: `!rob <uid>`')]
      });
      return;
    }

    if (target.bot) {
      await message.reply({
        embeds: [errorEmbed('Rob', 'Botow nie mozna okradac.')]
      });
      return;
    }

    if (target.id === message.author.id) {
      await message.reply({
        embeds: [errorEmbed('Rob', 'Nie mozesz okrasc samego siebie.')]
      });
      return;
    }

    const result = await withData(store => {
      const robber = createUser(message.author.id, store.users);
      const victim = createUser(target.id, store.users);
      const robberInventory = ensureInventoryRecord(store.inventory, message.author.id);
      const victimInventory = ensureInventoryRecord(store.inventory, target.id);

      if (victim.balance < config.economy.robMinTarget) {
        return {
          error: `Cel musi miec minimum ${formatCurrency(config.economy.robMinTarget)} w portfelu.`
        };
      }

      robber.gamesPlayed += 1;

      if (hasItem(victimInventory, 'robshield')) {
        removeItem(victimInventory, 'robshield', 1);
        addXp(robber, 10);
        refreshBadges(robber, robberInventory);
        refreshBadges(victim, victimInventory);

        return {
          shield: true
        };
      }

      if (Math.random() < config.economy.robSuccessChance) {
        const percent = Math.random() * (config.economy.robMaxPercent - config.economy.robMinPercent) + config.economy.robMinPercent;
        const stolen = Math.max(1, Math.floor(victim.balance * percent));

        victim.balance -= stolen;
        robber.balance += stolen;
        robber.totalWon += stolen;
        victim.totalLost += stolen;
        addXp(robber, 28);
        refreshBadges(robber, robberInventory);
        refreshBadges(victim, victimInventory);

        return {
          success: true,
          amount: stolen
        };
      }

      const fine = Math.min(robber.balance, randomInt(250, 1200));
      robber.balance -= fine;
      victim.balance += fine;
      robber.totalLost += fine;
      addXp(robber, 12);
      refreshBadges(robber, robberInventory);
      refreshBadges(victim, victimInventory);

      return {
        success: false,
        amount: fine
      };
    });

    if (result.error) {
      await message.reply({ embeds: [errorEmbed('Rob', result.error)] });
      return;
    }

    if (result.shield) {
      await message.reply({
        embeds: [errorEmbed('Rob', `${target} mial aktywny **Rob Shield**. Proba kradziezy zostala zablokowana.`)]
      });
      return;
    }

    const embed = result.success
      ? successEmbed('Rob udany', `Udalo ci sie ukrasc ${formatCurrency(result.amount)} od ${target}.`)
      : errorEmbed('Rob nieudany', `${target} zlapal cie na goracym uczynku. Straciles ${formatCurrency(result.amount)}.`);

    await message.reply({ embeds: [embed] });
  }
};
