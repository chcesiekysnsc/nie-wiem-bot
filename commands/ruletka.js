const config = require('../config/config');
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
  if (number === 0) return 'green';
  return RED_NUMBERS.has(number) ? 'red' : 'black';
}

function parseBetTarget(input) {
  const value = String(input || '').toLowerCase();
  if (['red', 'r', 'czerwony'].includes(value)) return { type: 'color', value: 'red', label: 'Czerwony' };
  if (['black', 'b', 'czarny'].includes(value)) return { type: 'color', value: 'black', label: 'Czarny' };
  if (['green', 'g', 'zielony'].includes(value)) return { type: 'color', value: 'green', label: 'Zielony' };
  if (['even', 'parzyste'].includes(value)) return { type: 'parity', value: 'even', label: 'Parzyste' };
  if (['odd', 'nieparzyste'].includes(value)) return { type: 'parity', value: 'odd', label: 'Nieparzyste' };

  const number = Number(value);
  if (Number.isInteger(number) && number >= 0 && number <= 36) {
    return { type: 'number', value: number, label: `Numer ${number}` };
  }
  return null;
}

module.exports = {
  name: 'ruletka',
  aliases: ['roulette', 'roul'],
  async execute(client, message, args) {
    const target = parseBetTarget(args[1]);

    if (!target) {
      await message.reply('❌ Użyj: `!ruletka <kwota> <czerwony/czarny/zielony/parzyste/nieparzyste/0-36>`');
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      const inventory = ensureInventoryRecord(store.inventory, message.author.id);
      const bet = resolveAmount(args[0], user.balance);

      if (!bet) return { error: '❌ Podaj poprawną kwotę betu.' };
      if (bet > user.balance) return { error: '❌ Brak wystarczających środków w portfelu.' };

      user.balance -= bet;

      const rolledNumber = Math.floor(Math.random() * 37);
      const rolledColor = getColor(rolledNumber);

      let won = false;
      let multiplier = 0;

      if (target.type === 'color') {
        won = rolledColor === target.value;
        multiplier = target.value === 'green' ? 36 : 2;
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
      recordGame(user, net);
      refreshBadges(user, inventory);

      return {
        won,
        bet,
        payout,
        net,
        rolledNumber,
        rolledColor,
        label: target.label
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const colorLabel = result.rolledColor === 'red' ? 'Czerwone' : result.rolledColor === 'black' ? 'Czarne' : 'Zielone';
    const outcome = `${result.rolledNumber} (${colorLabel})`;
    const winText = result.won ? `Wygrana! +${formatCurrency(result.net)}` : `Przegrana. -${formatCurrency(result.bet)}`;

    await message.reply(`🎰 Ruletka: Wypadło **${outcome}**. Typ: **${result.label}**. ${winText}`);
  }
};
