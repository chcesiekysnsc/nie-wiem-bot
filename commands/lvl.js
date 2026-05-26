const config = require('../config/config');
const { formatCurrency } = require('../utils/economy');

module.exports = {
  name: 'lvl',
  aliases: ['milestones', 'kamieniemilowe'],
  async execute(client, message, args) {
    const response = 
      `🎁 **Nagrody za Kamienie Milowe Poziomów (do 100 lvl):**\n\n` +
      `• **Lvl 10**: 5 000 💰 + 🟫 Brązowa Paczka\n` +
      `• **Lvl 20**: 15 000 💰 + 🔒 Kłódka\n` +
      `• **Lvl 30**: 30 000 💰 + 💣 Bomba\n` +
      `• **Lvl 40**: 60 000 💰 + 🍺 Piwo\n` +
      `• **Lvl 50**: 100 000 💰 + 🩶 Tytanowa Paczka\n` +
      `• **Lvl 60**: 150 000 💰 + 🔒 Kłódka + 💣 Bomba\n` +
      `• **Lvl 70**: 200 000 💰 + 🟨 Złota Paczka\n` +
      `• **Lvl 80**: 300 000 💰 + 🟦 Diamentowa Paczka\n` +
      `• **Lvl 90**: 450 000 💰 + 🩶 Tytanowa Paczka + 🔒 Kłódka\n` +
      `• **Lvl 100**: 1 000 000 💰 + 🩶 Tytanowa Paczka + 🟦 Diamentowa Paczka\n\n` +
      `*Nagrody są przyznawane automatycznie w momencie awansu na dany poziom.*`;

    await message.reply(response);
  }
};
