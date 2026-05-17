const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  addXp,
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  recordGame,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function normalizeChoice(input) {
  const value = String(input || '').toLowerCase();

  if (['heads', 'head', 'h', 'orzel'].includes(value)) {
    return 'heads';
  }

  if (['tails', 'tail', 't', 'reszka'].includes(value)) {
    return 'tails';
  }

  return null;
}

function displayChoice(choice) {
  return choice === 'heads' ? 'Orzel' : 'Reszka';
}

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  async execute(client, message, args) {
    const choice = normalizeChoice(args[1]);

    if (!choice) {
      await message.reply({
        embeds: [errorEmbed('Bledne uzycie', 'Uzyj: `!coinflip <bet> <orzel/reszka>`')]
      });
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bet = resolveAmount(args[0], user.balance);

      if (!bet) {
        return { error: 'Podaj poprawny bet.' };
      }

      if (bet > user.balance) {
        return { error: 'Nie masz tylu coinsow w portfelu.' };
      }

      if (bet > config.economy.maxBet) {
        return { error: `Max bet dla tej gry to ${formatCurrency(config.economy.maxBet)}.` };
      }

      user.balance -= bet;

      let flip = Math.random() < 0.5 ? 'heads' : 'tails';
      let luckySave = false;

      if (flip !== choice && hasItem(inventory, 'luckycharm') && Math.random() < 0.08) {
        flip = choice;
        luckySave = true;
      }

      const won = flip === choice;
      const payout = won ? bet * 2 : 0;
      user.balance += payout;

      const net = payout - bet;
      const leveledUp = recordGame(user, net);

      if (!won) {
        addXp(user, 6);
      }

      refreshBadges(user, inventory);

      return {
        won,
        bet,
        payout,
        net,
        leveledUp,
        flip,
        choice,
        luckySave
      };
    });

    if (result.error) {
      await message.reply({ embeds: [errorEmbed('Coinflip', result.error)] });
      return;
    }

    const embedFactory = result.won ? successEmbed : errorEmbed;
    const embed = embedFactory(
      'Coinflip',
      result.won ? 'Moneta byla po twojej stronie.' : 'Tym razem moneta nie dopisala.'
    ).addFields(
      { name: 'Twoj wybor', value: displayChoice(result.choice), inline: true },
      { name: 'Wynik rzutu', value: displayChoice(result.flip), inline: true },
      { name: 'Bet', value: formatCurrency(result.bet), inline: true },
      { name: 'Wyplata', value: formatCurrency(result.payout), inline: true },
      { name: 'Bilans rundy', value: `${result.net >= 0 ? '+' : '-'}${formatCurrency(Math.abs(result.net))}`, inline: true }
    );

    if (result.luckySave) {
      embed.addFields({ name: 'Lucky Charm', value: 'Talizman uratowal przegrana runde.', inline: false });
    }

    if (result.leveledUp) {
      embed.addFields({ name: 'Level up', value: 'Awansowales na kolejny level.', inline: false });
    }

    await message.reply({ embeds: [embed] });
  }
};
