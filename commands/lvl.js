const config = require('../config/config');
const { formatCurrency } = require('../utils/economy');

module.exports = {
  name: 'lvl',
  aliases: ['milestones', 'kamieniemilowe'],
  async execute(client, message, args) {
    const response = 
      `🎁 **Nagrody za Kamienie Milowe Poziomów (do 100 lvl):**\n\n` +
      `• **Lvl 10**: 150 000 💰 + 🟫 Brązowa Paczka\n` +
      `• **Lvl 20**: 250 000 💰 + 🔒 Kłódka\n` +
      `• **Lvl 30**: 350 000 💰 + 💣 Bomba + 🔒 Kłódka\n` +
      `• **Lvl 40**: 600 000 💰 + 🍺 Piwo + 💣 Bomba + 🔒 Kłódka\n` +
      `• **Lvl 50**: 800 000 💰 + 🟨 Złota Paczka + 🍺 Piwo\n` +
      `• **Lvl 60**: 1 000 000 💰 + ⬜ Srebrna Paczka + 🟨 Złota Paczka\n` +
      `• **Lvl 70**: 1 200 000 💰 + 🟦 Diamentowa Paczka\n` +
      `• **Lvl 80**: 1 500 000 💰 + 🟦 Diamentowa Paczka + 🟨 Złota Paczka + ⬜ Srebrna Paczka + 🍺 Piwo + 🔒 Kłódka\n` +
      `• **Lvl 90**: 1 500 000 💰 + 2x 🟦 Diamentowa Paczka + 🟨 Złota Paczka + 2x 💣 Bomba\n` +
      `• **Lvl 100**: 2 000 000 💰 + 🩶 Tytanowa Paczka + 2x 🟦 Diamentowa Paczka + 2x 🟨 Złota Paczka + 3x ⬜ Srebrna Paczka\n\n` +
      `🔄 **Prestiż**: Po osiągnięciu 100 poziomu i odebraniu nagród Twój poziom resetuje się do 1, a Twój Prestiż wzrasta o 1. Każdy poziom Prestiżu zwiększa wymagane XP o 65 oraz o 5% wartości bazowej na każdym poziomie. Maksymalny poziom Prestiżu to 15.\n\n` +
      `*Nagrody są przyznawane automatycznie w momencie awansu na dany poziom.*`;

    await message.reply(response);
  }
};
