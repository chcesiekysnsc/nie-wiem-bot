const { withData, createUser } = require('./storage');

const BALANCE_THRESHOLD = 1000000000;
const REPORT_WINDOW_MS = 30 * 60 * 1000;
const ADMIN_GROUP_ID = '5277347745703557';

function buildResetNotification() {
  return (
    `⚠️ Wykryto ponad 1 000 000 000 💰 na Twoim koncie. Twoje saldo zostało zresetowane do 0.\n` +
    `🚨 Zgłoś ten błąd komendą: **!blad <opis okoliczności>** (np. !blad dostałem kasę po użyciu !gielda).\n` +
    `⛔ Dopóki nie zgłosisz błędu, nie możesz używać żadnych innych komend.\n` +
    `⏳ Jeśli błąd nie zostanie zgłoszony w ciągu 30 minut, zostanie automatycznie nałożona czarna lista.`
  );
}

async function checkAndResetBalance(reply, senderId) {
  let balanceCheck = { triggered: false };

  try {
    balanceCheck = await withData(store => {
      const u = createUser(senderId, store.users);
      const balance = u.balance || 0;
      const bank = u.bank || 0;
      const total = balance + bank;
      console.log(`[BALANCE-CHECK] userId=${senderId} balance=${balance} bank=${bank} total=${total}`);

      if (total >= BALANCE_THRESHOLD) {
        console.log(`[BALANCE-CHECK] RESET triggered for ${senderId}`);
        u.balance = 0;
        u.bank = 0;

        store.profiles = store.profiles || {};
        store.profiles.pendingBalanceReports = store.profiles.pendingBalanceReports || {};
        store.profiles.pendingBalanceReports[senderId] = {
          flaggedAt: Date.now(),
          reported: false
        };

        return { triggered: true };
      }
      return { triggered: false };
    });
    console.log(`[BALANCE-CHECK] Result for ${senderId}: triggered=${balanceCheck.triggered}`);
  } catch (err) {
    console.error('[BALANCE-CHECK] Błąd podczas sprawdzania salda:', err);
  }

  if (balanceCheck.triggered) {
    await reply(buildResetNotification()).catch(() => null);
    return true;
  }

  return false;
}

async function checkPendingBalanceBlock(reply, senderId, commandName) {
  if (commandName === 'blad') {
    return false;
  }

  const pending = await withData(store => {
    store.profiles = store.profiles || {};
    store.profiles.pendingBalanceReports = store.profiles.pendingBalanceReports || {};
    return store.profiles.pendingBalanceReports[senderId] || null;
  });

  if (pending && !pending.reported) {
    const leftMs = Math.max(0, REPORT_WINDOW_MS - (Date.now() - pending.flaggedAt));
    const leftMin = Math.max(1, Math.ceil(leftMs / 60000));
    await reply(
      `⛔ Masz niezgłoszony błąd przekroczenia salda. Nie możesz używać żadnych komend, dopóki go nie zgłosisz.\n` +
      `👉 Użyj: **!blad <opis okoliczności>**\n` +
      `⏳ Pozostało: **${leftMin} min** zanim zostaniesz automatycznie dodany do czarnej listy.`
    ).catch(() => null);
    return true;
  }

  return false;
}

async function checkOverdueBalanceReports(sendMessage) {
  try {
    const overdueIds = await withData(store => {
      store.profiles = store.profiles || {};
      store.profiles.pendingBalanceReports = store.profiles.pendingBalanceReports || {};
      store.profiles.blacklist = store.profiles.blacklist || [];

      const now = Date.now();
      const overdue = [];

      for (const [userId, entry] of Object.entries(store.profiles.pendingBalanceReports)) {
        if (entry.reported) {
          delete store.profiles.pendingBalanceReports[userId];
          continue;
        }
        if (now - entry.flaggedAt >= REPORT_WINDOW_MS) {
          if (!store.profiles.blacklist.includes(userId)) {
            store.profiles.blacklist.push(userId);
          }
          overdue.push(userId);
          delete store.profiles.pendingBalanceReports[userId];
        }
      }

      return overdue;
    });

    if (overdueIds.length > 0 && typeof sendMessage === 'function') {
      for (const userId of overdueIds) {
        console.log(`[BALANCE-CHECK] ${userId} nie zgłosił błędu w 30 minut — dodano do czarnej listy.`);
        sendMessage(
          `🚫 Użytkownik ID ${userId} nie zgłosił błędu przekroczenia salda w ciągu 30 minut — automatycznie dodany do czarnej listy.`,
          ADMIN_GROUP_ID
        );
      }
    }
  } catch (err) {
    console.error('[BALANCE-CHECK] Błąd podczas sprawdzania przeterminowanych zgłoszeń:', err);
  }
}

module.exports = {
  checkAndResetBalance,
  checkPendingBalanceBlock,
  checkOverdueBalanceReports,
  BALANCE_THRESHOLD,
  REPORT_WINDOW_MS
};
