module.exports = {
  name: 'zasady',
  aliases: ['rules'],
  async execute(client, message, args) {
    const rulesText = `📜 **Zasady korzystania z bota:**\n\n` +
      `1. Farmiąc pieniądze na alt kontach czyli robienie ciągłego daily work crime jest na waszą odpowiedzialność\n` +
      `2. Nie zaleca sie trzymania topki na kontach których nie da sie znależć ani nie da sie dodawać do grup\n` +
      `3. Wykryty błąd należy zgłosić do administracji (https://www.facebook.com/Rafalloleksy)\n` +
      `4. Każdego 1 dnia miesiąca resetowana jest ekonomia`;

    await message.reply(rulesText);
  }
};
