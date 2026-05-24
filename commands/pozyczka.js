const { formatCurrency, msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'pozyczka',
  aliases: ['kredyt', 'loan'],
  async execute(client, message, args) {
    const action = String(args[0] || '').trim().toLowerCase();

    if (!action) {
      // Pokaż status aktywnej pożyczki
      const status = await withData(store => {
        const user = createUser(message.author.id, store.users);
        return user.activeLoan ? { ...user.activeLoan, balance: user.balance } : null;
      });

      if (!status) {
        await message.reply(
          `🏦 **Pożyczki wirtualne**\n` +
          `Nie masz obecnie żadnej aktywnej pożyczki.\n\n` +
          `👉 Aby pożyczyć pieniądze, wpisz: \`!pozyczka <kwota>\`\n` +
          `ℹ️ *Maksymalny limit: 500 000 💰.*\n` +
          `📈 *Oprocentowanie (co 6h od aktualnego długu):*\n` +
          `• do 200k — **4%**\n` +
          `• powyżej 200k (do 300k) — **8%**\n` +
          `• powyżej 300k (do 400k) — **12%**\n` +
          `• powyżej 400k (do 500k) — **20%**\n` +
          `🔒 *Środki z pożyczki mają blokadę na przelewy/marry oraz ochronę przed okradaniem (!rob) na 48h. Po tym czasie bot sam ściągnie należność.*`
        );
        return;
      }

      const elapsed = Date.now() - status.takenAt;
      const remainingRepayMs = Math.max(0, 48 * 60 * 60 * 1000 - elapsed);
      
      const lastInterest = status.lastInterestApplied || status.takenAt;
      const elapsedInterest = Date.now() - lastInterest;
      const remainingInterestMs = Math.max(0, 6 * 60 * 60 * 1000 - elapsedInterest);

      const percentRate = Math.round(status.rate * 100);

      await message.reply(
        `🏦 **Twoja Aktywna Pożyczka**\n` +
        `💵 Pożyczona kwota: **${formatCurrency(status.originalAmount)}**\n` +
        `💰 Aktualnie do spłaty: **${formatCurrency(status.amount)}**\n` +
        `📈 Oprocentowanie: **${percentRate}% co 6 godzin**\n` +
        `⏱️ Auto-spłata za: **${msToReadable(remainingRepayMs)}**\n` +
        `⚡ Następne odsetki za: **${msToReadable(remainingInterestMs)}**\n\n` +
        `👉 Aby spłacić pożyczkę, wpisz: \`!pozyczka splac <kwota|all>\``
      );
      return;
    }

    if (['splac', 'repay', 'splata', 'spłac', 'oddaj'].includes(action)) {
      const rawAmount = args[1];
      if (!rawAmount) {
        await message.reply('❌ Użyj: `!pozyczka splac <kwota|all>`');
        return;
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        if (!user.activeLoan) {
          return { error: '❌ Nie masz obecnie żadnej aktywnej pożyczki do spłaty.' };
        }

        const isAll = ['all', 'max'].includes(String(rawAmount).toLowerCase());
        let amountToRepay = isAll ? user.activeLoan.amount : Math.floor(Number(rawAmount));

        if (isNaN(amountToRepay) || amountToRepay <= 0) {
          return { error: '❌ Podaj poprawną kwotę do spłaty: `!pozyczka splac <kwota|all>`' };
        }

        amountToRepay = Math.min(amountToRepay, user.activeLoan.amount);

        if (user.balance < amountToRepay) {
          return { error: `❌ Nie masz tylu środków w portfelu. Posiadasz: ${formatCurrency(user.balance)}` };
        }

        user.balance -= amountToRepay;
        user.activeLoan.amount -= amountToRepay;
        
        // Zmniejsz pierwotnie zablokowaną kwotę proporcjonalnie
        user.activeLoan.originalAmount = Math.max(0, user.activeLoan.originalAmount - amountToRepay);

        const remaining = user.activeLoan.amount;
        if (remaining <= 0) {
          user.activeLoan = null;
          return { success: true, fullyPaid: true, paid: amountToRepay, balance: user.balance };
        }

        return { success: true, fullyPaid: false, paid: amountToRepay, remaining, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      if (result.fullyPaid) {
        await message.reply(`🎉 Spłaciłeś pożyczkę w całości! Balans Twojego portfela: **${formatCurrency(result.balance)}**.`);
      } else {
        await message.reply(`💰 Spłaciłeś część pożyczki (**${formatCurrency(result.paid)}**). Pozostało do spłaty: **${formatCurrency(result.remaining)}**. Nowy balans portfela: **${formatCurrency(result.balance)}**.`);
      }
      return;
    }

    // Wzięcie pożyczki
    const borrowAmount = Math.floor(Number(args[0]));
    if (isNaN(borrowAmount) || borrowAmount <= 0) {
      await message.reply('❌ Podaj poprawną kwotę pożyczki lub użyj `!pozyczka splac <kwota|all>`.');
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      if (user.activeLoan) {
        return { error: '❌ Masz już aktywną pożyczkę. Spłać ją najpierw, zanim weźmiesz kolejną.' };
      }

      if (borrowAmount > 500000) {
        return { error: '❌ Maksymalna kwota pożyczki to **500 000 💰**.' };
      }

      // Progi oprocentowania:
      // do 200k — 4%
      // powyżej 200k (do 300k) — 8%
      // powyżej 300k (do 400k) — 12%
      // powyżej 400k (do 500k) — 20%
      let rate = 0.04;
      if (borrowAmount > 400000) {
        rate = 0.20;
      } else if (borrowAmount > 300000) {
        rate = 0.12;
      } else if (borrowAmount > 200000) {
        rate = 0.08;
      }

      user.activeLoan = {
        originalAmount: borrowAmount,
        amount: borrowAmount,
        rate: rate,
        takenAt: Date.now(),
        lastInterestApplied: Date.now()
      };

      user.balance = (user.balance || 0) + borrowAmount;

      return { success: true, borrowAmount, rate, balance: user.balance };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const percentRate = Math.round(result.rate * 100);
    await message.reply(
      `🎉 Pomyślnie pożyczono **${formatCurrency(result.borrowAmount)}** z banku wirtualnego!\n` +
      `📈 Oprocentowanie: **${percentRate}% co 6 godzin**.\n` +
      `🔒 Środki te mają blokadę na przelewy/marry oraz ochronę przed okradaniem (!rob) na 48 godzin.\n` +
      `⚠️ Po 48 godzinach bot automatycznie spłaci całą pożyczkę z Twojego portfela (może zaminusować konto!).`
    );
  }
};
