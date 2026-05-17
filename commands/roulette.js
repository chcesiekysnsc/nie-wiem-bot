const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
  ensureInventoryRecord,
  formatCurrency,
  formatNumber,
  recordGame,
  refreshBadges,
  resolveAmount
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function getColor(number) {
  if (number === 0) {
    return 'green';
  }

  return RED_NUMBERS.has(number) ? 'red' : 'black';
}

function parseBetTarget(input) {
  const value = String(input || '').toLowerCase();

  if (['red', 'r', 'czerwony'].includes(value)) {
    return { type: 'color', value: 'red', label: 'Red' };
  }

  if (['black', 'b', 'czarny'].includes(value)) {
    return { type: 'color', value: 'black', label: 'Black' };
  }

  if (['green', 'g', 'zielony'].includes(value)) {
    return { type: 'color', value: 'green', label: 'Green' };
  }

  if (['even', 'parzyste'].includes(value)) {
    return { type: 'parity', value: 'even', label: 'Even' };
  }

  if (['odd', 'nieparzyste'].includes(value)) {
    return { type: 'parity', value: 'odd', label: 'Odd' };
  }

  const number = Number(value);
  if (Number.isInteger(number) && number >= 0 && number <= 36) {
    return { type: 'number', value: number, label: `Number ${number}` };
  }

  return null;
}

module.exports = {
  name: 'roulette',
  aliases: ['roul'],
  async execute(client, message, args) {
    const target = parseBetTarget(args[1]);

    if (!target) {
      await message.reply({
        embeds: [errorEmbed('Bledne uzycie', 'Uzyj: `!roulette <bet> <red|black|green|even|odd|0-36>`')]
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

      const rolledNumber = Math.floor(Math.random() * 37);
      const rolledColor = getColor(rolledNumber);

      let won = false;
      let multiplier = 0;

      if (target.type === 'color') {
        won = rolledColor === target.value;
        multiplier = target.value === 'green' ? 14 : 2;
      } else if (target.type === 'parity') {
        won = rolledNumber !== 0 && ((rolledNumber % 2 === 0 && target.value === 'even') || (rolledNumber % 2 === 1 && target.value === 'odd'));
        multiplier = 2;
      } else if (target.type === 'number') {
        won = rolledNumber === target.value;
        multiplier = rolledNumber === 0 ? 18 : 12;
      }

      const payout = won ? bet * multiplier : 0;
      user.balance += payout;

      const net = payout - bet;
      const leveledUp = recordGame(user, net);
      refreshBadges(user, inventory);

      return {
        won,
        bet,
        payout,
        net,
        rolledNumber,
        rolledColor,
        label: target.label,
        leveledUp
      };
    });

    if (result.error) {
      await message.reply({ embeds: [errorEmbed('Roulette', result.error)] });
      return;
    }

    const embedFactory = result.won ? successEmbed : errorEmbed;
    const embed = embedFactory(
      'Roulette',
      result.won ? 'Ruletka byla po twojej stronie.' : 'Kulka nie trafila twojego typu.'
    ).addFields(
      { name: 'Typ', value: result.label, inline: true },
      { name: 'Wynik', value: `${formatNumber(result.rolledNumber)} (${result.rolledColor})`, inline: true },
      { name: 'Bet', value: formatCurrency(result.bet), inline: true },
      { name: 'Wyplata', value: formatCurrency(result.payout), inline: true },
      { name: 'Bilans rundy', value: `${result.net >= 0 ? '+' : '-'}${formatCurrency(Math.abs(result.net))}`, inline: true }
    );

    if (result.leveledUp) {
      embed.addFields({ name: 'Level up', value: 'Ruletka wbila ci kolejny level.', inline: false });
    }

    await message.reply({ embeds: [embed] });
  }
};
