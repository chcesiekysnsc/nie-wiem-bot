const { formatCurrency, formatNumber, msToReadable, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function getPolandOffsetMs(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getVal = type => Number(parts.find(p => p.type === type).value);
  
  const utcDate = Date.UTC(
    getVal('year'),
    getVal('month') - 1,
    getVal('day'),
    getVal('hour'),
    getVal('minute'),
    getVal('second')
  );
  
  return utcDate - date.getTime();
}

function getPolandDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

function getUserIdFromArg(arg, rawEvent) {
  if (!arg) return null;
  const value = String(arg).trim();
  if (value.startsWith('@') && rawEvent && rawEvent.mentions) {
    const cleanName = value.slice(1).toLowerCase();
    for (const [id, name] of Object.entries(rawEvent.mentions)) {
      if (name.toLowerCase().includes(cleanName)) {
        return id;
      }
    }
  }
  const match = value.match(/^\d{14,16}$/);
  return match ? match[0] : null;
}

const LOAN_UNLOCK_COMMANDS = 100;

function getLoanUnlockState(commandsUsed) {
  const used = Math.max(0, Math.floor(Number(commandsUsed) || 0));
  const required = LOAN_UNLOCK_COMMANDS + 1;

  return {
    used,
    required,
    remaining: Math.max(0, required - used),
    unlocked: used > LOAN_UNLOCK_COMMANDS
  };
}

function buildLoanUnlockStatus(commandsUsed) {
  const unlockState = getLoanUnlockState(commandsUsed);

  if (unlockState.unlocked) {
    return `✅ Dostęp do pożyczki odblokowany. Użyte komendy: **${formatNumber(unlockState.used)}**.`;
  }

  return (
    `🔐 Pożyczka odblokowuje się dopiero po użyciu ponad **${formatNumber(LOAN_UNLOCK_COMMANDS)}** komend.\n` +
    `📊 Twój postęp: **${formatNumber(unlockState.used)}/${formatNumber(unlockState.required)}** użytych komend.`
  );
}

function buildLoanUnlockError(commandsUsed) {
  const unlockState = getLoanUnlockState(commandsUsed);

  return (
    `❌ Pożyczka odblokowuje się dopiero po użyciu ponad **${formatNumber(LOAN_UNLOCK_COMMANDS)}** komend. ` +
    `Masz teraz **${formatNumber(unlockState.used)}/${formatNumber(unlockState.required)}** użytych komend, ` +
    `więc brakuje Ci jeszcze **${formatNumber(unlockState.remaining)}** do odblokowania.`
  );
}

module.exports = {
  name: 'pozyczka',
  aliases: ['kredyt', 'loan'],
  async execute(client, message, args) {
    const action = String(args[0] || '').trim().toLowerCase();

    // Sprawdź czy to akcja pożyczki między graczami
    const isPlayerAcc = ['acc', 'akceptuj'].includes(action);
    const isPlayerDec = ['dec', 'odrzuc', 'odrzuć'].includes(action);
    
    // Wyciągamy ID dłużnika z pierwszego argumentu (jeśli to propozycja)
    const targetBorrowerId = getUserIdFromArg(args[0], message.rawEvent);
    const isPlayerProposal = !!targetBorrowerId && !['acc', 'akceptuj', 'dec', 'odrzuc', 'odrzuć', 'gracz', 'splac', 'repay', 'splata', 'spłac', 'oddaj'].includes(action);

    if (action === 'gracz' && String(args[1] || '').trim().toLowerCase() === 'splac') {
      let targetLenderId = getUserIdFromArg(args[2], message.rawEvent);
      let rawAmount = targetLenderId ? args[3] : args[2];

      const amountToRepay = resolveAmount(rawAmount, 0);
      if (!amountToRepay || amountToRepay <= 0) {
        await message.reply('❌ Podaj poprawną kwotę do spłaty: **!pozyczka gracz splac <kwota>** lub **!pozyczka gracz splac @lender <kwota>**');
        return;
      }

      const result = await withData(store => {
        const borrower = createUser(message.author.id, store.users);
        if (borrower.balance < amountToRepay) {
          return { error: `❌ Nie masz tyle gotówki w portfelu. Posiadasz: ${formatCurrency(borrower.balance)}` };
        }

        if (!store.profiles.playerLoans || !Array.isArray(store.profiles.playerLoans)) {
          return { error: '❌ Nie masz żadnej aktywnej pożyczki od innego gracza.' };
        }

        let userLoans = store.profiles.playerLoans.filter(l => l.borrowerId === message.author.id && l.amount > 0);

        if (userLoans.length === 0) {
          return { error: '❌ Nie masz żadnej aktywnej pożyczki od innego gracza.' };
        }

        if (targetLenderId) {
          userLoans = userLoans.filter(l => l.lenderId === targetLenderId);
          if (userLoans.length === 0) {
            return { error: '❌ Nie masz aktywnej pożyczki od tego gracza.' };
          }
        }

        const loan = userLoans[0];
        const lender = createUser(loan.lenderId, store.users);

        const maxRepay = loan.amount;
        const actualRepay = Math.min(amountToRepay, maxRepay);

        const R = loan.installmentAmount;
        if (actualRepay !== maxRepay) {
          if (actualRepay < R) {
            return { error: `❌ Minimalna kwota przedwczesnej raty to co najmniej jedna rata (${formatCurrency(R)}).` };
          }
          if (actualRepay > R && actualRepay < 2 * R) {
            return { error: `❌ Jeśli chcesz wpłacić więcej niż jedną ratę, musisz wpłacić minimum równowartość dwóch rat (${formatCurrency(2 * R)}).` };
          }
        }

        borrower.balance -= actualRepay;
        lender.balance = (lender.balance || 0) + actualRepay;
        loan.amount -= actualRepay;

        if (typeof loan.remainingInstallments === 'number') {
          const installmentsPaid = Math.floor(actualRepay / R);
          loan.remainingInstallments = Math.max(0, loan.remainingInstallments - installmentsPaid);
        }

        const lenderName = lender.name || `Gracz_${loan.lenderId.slice(-6)}`;
        const borrowerName = borrower.name || `Gracz_${loan.borrowerId.slice(-6)}`;
        const remaining = loan.amount;

        if (remaining <= 0) {
          store.profiles.playerLoans = store.profiles.playerLoans.filter(l => l.id !== loan.id);
          return {
            success: true,
            fullyPaid: true,
            paid: actualRepay,
            lenderName,
            borrowerName,
            remaining: 0
          };
        }

        return {
          success: true,
          fullyPaid: false,
          paid: actualRepay,
          lenderName,
          borrowerName,
          remaining
        };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      if (result.fullyPaid) {
        await message.reply(
          `🎉 **POŻYCZKA SPŁACONA W CAŁOŚCI!** 🎉\n` +
          `Gracz **${result.borrowerName}** spłacił przedwcześnie w całości swoją pożyczkę wobec **${result.lenderName}** kwotą **${formatCurrency(result.paid)}**!`
        );
      } else {
        await message.reply(
          `💰 **PRZEDWCZESNA WPŁATA RATA** 💰\n` +
          `Gracz **${result.borrowerName}** wpłacił przedwcześnie **${formatCurrency(result.paid)}** na poczet pożyczki wobec **${result.lenderName}**.\n` +
          `📉 Pozostało do spłaty: **${formatCurrency(result.remaining)}**.`
        );
      }
      return;
    }

    if (isPlayerAcc || isPlayerDec) {
      const lenderId = getUserIdFromArg(args[1], message.rawEvent) || args[1];

      if (!lenderId) {
        await message.reply(`❌ Użyj: **!pozyczka acc/dec @pozyczkodawca** lub **!pozyczka acc/dec <id_pozyczkodawcy>**`);
        return;
      }

      const proposalKey = `${message.author.id}-${lenderId}`;
      client.pendingPlayerLoans = client.pendingPlayerLoans || new Map();
      const proposal = client.pendingPlayerLoans.get(proposalKey);

      if (!proposal || proposal.expiresAt < Date.now()) {
        await message.reply('❌ Nie znaleziono aktywnej oferty pożyczki od tego gracza lub oferta już wygasła.');
        return;
      }

      if (isPlayerDec) {
        client.pendingPlayerLoans.delete(proposalKey);
        await message.reply('❌ Odrzuciłeś ofertę pożyczki.');
        return;
      }

      // Akceptacja!
      let ageError = false;
      let balanceError = false;
      let lenderBalance = 0;
      let finalLenderName = '';
      let finalBorrowerName = '';

      const result = await withData(store => {
        const lender = createUser(proposal.lenderId, store.users);
        const borrower = createUser(proposal.borrowerId, store.users);

        lenderBalance = lender.balance || 0;

        const lenderCmds = lender.commandsUsed || 0;
        const lenderMsgs = lender.messageCount || 0;
        const borrowerCmds = borrower.commandsUsed || 0;
        const borrowerMsgs = borrower.messageCount || 0;

        if (lenderCmds < 101 || lenderMsgs < 100 || borrowerCmds < 101 || borrowerMsgs < 100) {
          ageError = true;
          return { error: '❌ Konto pożyczkodawcy lub pożyczkobiorcy jest za młode.' };
        }

        if (lender.balance < proposal.amount) {
          balanceError = true;
          return { error: '❌ Pożyczkodawca nie ma już wystarczających środków w portfelu.' };
        }

        if (proposal.amount > lender.balance * 0.40) {
          balanceError = true;
          return { error: '❌ Kwota pożyczki przekracza 40% aktualnego salda pożyczkodawcy.' };
        }

        // Transakcja!
        lender.balance -= proposal.amount;
        borrower.balance = (borrower.balance || 0) + proposal.amount;

        // Rejestracja pożyczki
        store.profiles.playerLoans = store.profiles.playerLoans || [];
        
        const nextDate = new Date();
        const offset = getPolandOffsetMs(nextDate);
        const polTime = new Date(nextDate.getTime() + offset);
        polTime.setUTCDate(polTime.getUTCDate() + proposal.frequencyDays);
        const nextCollectionDate = getPolandDateString(polTime);

        const newLoan = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          lenderId: proposal.lenderId,
          borrowerId: proposal.borrowerId,
          amount: proposal.totalRepay,
          originalAmount: proposal.totalRepay,
          principalAmount: proposal.amount,
          totalInstallments: proposal.totalInstallments,
          remainingInstallments: proposal.totalInstallments,
          autoCollectCount: proposal.autoCollectCount,
          autoCollectedCount: 0,
          installmentAmount: proposal.installmentAmount,
          penaltyRate: proposal.penaltyRate,
          frequencyDays: proposal.frequencyDays,
          status: 'active',
          createdAt: Date.now(),
          nextCollectionDate: nextCollectionDate
        };

        store.profiles.playerLoans.push(newLoan);

        finalLenderName = lender.name || `Użytkownik_${lender.id.slice(-6)}`;
        finalBorrowerName = borrower.name || `Użytkownik_${borrower.id.slice(-6)}`;

        return { success: true };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      client.pendingPlayerLoans.delete(proposalKey);

      await message.reply(
        `🎉 **POŻYCZKA ZAAKCEPTOWANA!** 🎉\n` +
        `Gracz **${finalLenderName}** pożyczył **${formatCurrency(proposal.amount)}** graczowi **${finalBorrowerName}**!\n` +
        `📈 Łącznie do spłaty: **${formatCurrency(proposal.totalRepay)}** w **${proposal.totalInstallments}** ratach po **${formatCurrency(proposal.installmentAmount)}**.\n` +
        `📆 Pierwsza rata zostanie pobrana automatycznie za **${proposal.frequencyDays}** dni o godzinie 00:00 (czasu polskiego).`
      );
      return;
    } else if (isPlayerProposal) {
      const targetId = targetBorrowerId;
      const kwota = resolveAmount(args[1], 0);
      const ilosc_rat = parseInt(args[2]);
      const kwota_raty = resolveAmount(args[3], 0);
      const oprocentowanie_spoznienia = parseFloat(args[4]);
      const co_ile_dni = parseInt(args[5]);
      const ile_do_splaty = resolveAmount(args[6], 0);

      if (!targetId || !kwota || isNaN(ilosc_rat) || !kwota_raty || isNaN(oprocentowanie_spoznienia) || isNaN(co_ile_dni) || !ile_do_splaty) {
        await message.reply(
          `❌ **Użycie pożyczki między graczami:**\n` +
          `👉 Propozycja: **!pozyczka @osoba <kwota> <ilosc_rat> <kwota_raty> <oprocentowanie_spoznienia> <co_ile_dni_pobiera> <ile_do_splaty>**\n` +
          `ℹ️ *Przykład: !pozyczka @Kowalski 10000 5 2500 20 2 12500*`
        );
        return;
      }

      if (targetId === message.author.id) {
        await message.reply('❌ Nie możesz pożyczyć pieniędzy samemu sobie.');
        return;
      }

      if (co_ile_dni < 1) {
        await message.reply(`❌ Częstotliwość pobierania rat musi wynosić minimum 1 dzień.`);
        return;
      }

      let ageError = false;
      let balanceError = false;
      let lenderBalance = 0;

      await withData(store => {
        const lender = createUser(message.author.id, store.users);
        const borrower = createUser(targetId, store.users);

        lenderBalance = lender.balance || 0;

        const lenderCmds = lender.commandsUsed || 0;
        const lenderMsgs = lender.messageCount || 0;
        const borrowerCmds = borrower.commandsUsed || 0;
        const borrowerMsgs = borrower.messageCount || 0;

        if (lenderCmds < 101 || lenderMsgs < 100 || borrowerCmds < 101 || borrowerMsgs < 100) {
          ageError = true;
        }

        if (kwota > lenderBalance * 0.40) {
          balanceError = true;
        }
      });

      if (ageError) {
        await message.reply('❌ Konto pożyczkodawcy lub pożyczkobiorcy jest za młode.');
        return;
      }

      if (balanceError) {
        await message.reply(`❌ Maksymalna kwota pożyczki to **40% salda pożyczkodawcy** (maksymalnie: ${formatCurrency(Math.floor(lenderBalance * 0.40))}).`);
        return;
      }

      client.pendingPlayerLoans = client.pendingPlayerLoans || new Map();
      const proposalKey = `${targetId}-${message.author.id}`;
      client.pendingPlayerLoans.set(proposalKey, {
        lenderId: message.author.id,
        borrowerId: targetId,
        amount: kwota,
        totalRepay: ile_do_splaty,
        totalInstallments: ilosc_rat,
        autoCollectCount: ilosc_rat,
        installmentAmount: kwota_raty,
        penaltyRate: oprocentowanie_spoznienia / 100,
        frequencyDays: co_ile_dni,
        expiresAt: Date.now() + 5 * 60 * 1000
      });

      let borrowerNameStr = `Gracz_${targetId.slice(-6)}`;
      const resolvedUser = client.getUser(targetId);
      if (resolvedUser && resolvedUser.username) {
        borrowerNameStr = resolvedUser.username;
      }

      await message.reply(
        `✉️ **Zaproponowano pożyczkę dla @${borrowerNameStr}!**\n` +
        `💵 Kwota pożyczona: **${formatCurrency(kwota)}**\n` +
        `💰 Do spłaty łącznie: **${formatCurrency(ile_do_splaty)}**\n` +
        `📊 Ilość rat: **${ilosc_rat}** (wszystkie pobierane automatycznie przez bota)\n` +
        `💸 Rata: **${formatCurrency(kwota_raty)}** (co **${co_ile_dni} dni**)\n` +
        `📈 Oprocentowanie spóźnienia: **${oprocentowanie_spoznienia}%**\n\n` +
        `👉 Aby zaakceptować pożyczkę, pożyczkobiorca musi wpisać: **!pozyczka acc @${message.author.username || 'pozyczkodawca'}** lub **!pozyczka acc ${message.author.id}** (oferta ważna 5 minut).`
      );
      return;
    }

    if (!action) {
      // Pokaż status aktywnej pożyczki
      const snapshot = await withData(store => {
        const user = createUser(message.author.id, store.users);

        return {
          activeLoan: user.activeLoan ? { ...user.activeLoan } : null,
          balance: user.balance,
          commandsUsed: user.commandsUsed || 0
        };
      });

      if (!snapshot.activeLoan) {
        await message.reply(
          `🏦 **Pożyczki wirtualne**\n` +
          `Nie masz obecnie żadnej aktywnej pożyczki.\n\n` +
          `👉 Aby pożyczyć pieniądze, wpisz: **!pozyczka <kwota>**\n` +
          `${buildLoanUnlockStatus(snapshot.commandsUsed)}\n` +
          `ℹ️ *Maksymalny limit: 500 000 💰.*\n` +
          `📈 *Oprocentowanie (co 6h od aktualnego długu):*\n` +
          `• do 200k — **4%**\n` +
          `• powyżej 200k (do 300k) — **8%**\n` +
          `• powyżej 300k (do 400k) — **12%**\n` +
          `• powyżej 400k (do 500k) — **20%**\n` +
          `🔒 *Środki z pożyczki mają blokadę na przelewy (!tip), ślub (!marry), wpłaty gangu (!gang wplac) oraz ochronę przed okradaniem (!rob) do momentu spłaty.*`
        );
        return;
      }

      const { activeLoan } = snapshot;
      const elapsed = Date.now() - activeLoan.takenAt;
      const remainingRepayMs = Math.max(0, 48 * 60 * 60 * 1000 - elapsed);
      
      const lastInterest = activeLoan.lastInterestApplied || activeLoan.takenAt;
      const elapsedInterest = Date.now() - lastInterest;
      const remainingInterestMs = Math.max(0, 6 * 60 * 60 * 1000 - elapsedInterest);

      const percentRate = Math.round(activeLoan.rate * 100);

      await message.reply(
        `🏦 **Twoja Aktywna Pożyczka**\n` +
        `💵 Pożyczona kwota: **${formatCurrency(activeLoan.originalAmount)}**\n` +
        `💰 Aktualnie do spłaty: **${formatCurrency(activeLoan.amount)}**\n` +
        `📈 Oprocentowanie: **${percentRate}% co 6 godzin**\n` +
        `⏱️ Auto-spłata za: **${msToReadable(remainingRepayMs)}**\n` +
        `⚡ Następne odsetki za: **${msToReadable(remainingInterestMs)}**\n\n` +
        `👉 Aby spłacić pożyczkę, wpisz: **!pozyczka splac <kwota|all>**`
      );
      return;
    }

    if (['splac', 'repay', 'splata', 'spłac', 'oddaj'].includes(action)) {
      const rawAmount = args[1];
      if (!rawAmount) {
        await message.reply('❌ Użyj: **!pozyczka splac <kwota|all>**');
        return;
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        if (!user.activeLoan) {
          return { error: '❌ Nie masz obecnie żadnej aktywnej pożyczki do spłaty.' };
        }

        const isAll = ['all', 'max'].includes(String(rawAmount).toLowerCase());
        let amountToRepay = 0;
        if (isAll) {
          amountToRepay = user.activeLoan.amount;
        } else {
          amountToRepay = resolveAmount(rawAmount, user.activeLoan.amount);
        }

        if (!amountToRepay || amountToRepay <= 0) {
          return { error: '❌ Podaj poprawną kwotę do spłaty: **!pozyczka splac <kwota|all>**' };
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
    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);
      if (user.activeLoan) {
        return { error: '❌ Masz już aktywną pożyczkę. Spłać ją najpierw, zanim weźmiesz kolejną.' };
      }

      if ((user.balance || 0) < 0) {
        return { error: '❌ Nie możesz wziąć pożyczki, gdy masz ujemne saldo.' };
      }

      if ((user.commandsUsed || 0) <= LOAN_UNLOCK_COMMANDS) {
        return { error: buildLoanUnlockError(user.commandsUsed) };
      }

      const borrowAmount = resolveAmount(args[0], 500000);
      if (!borrowAmount || borrowAmount <= 0) {
        return { error: '❌ Podaj poprawną kwotę pożyczki lub użyj **!pozyczka splac <kwota|all>**.' };
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
      `🔒 Środki te mają całkowitą blokadę na przelewy, ślub, wpłaty do gangu oraz ochronę przed okradaniem do momentu spłaty.\n` +
      `⚠️ Po 48 godzinach bot automatycznie spłaci całą pożyczkę z Twojego portfela (może zaminusować konto!).`
    );
  }
};
