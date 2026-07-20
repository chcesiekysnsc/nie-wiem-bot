const { withData, createUser } = require('./storage');
const { createMessageContext } = require('./messenger');

const BALANCE_THRESHOLD = 1000000000;
const RESET_NOTIFICATION =
  `⚠️ Wykryto ponad 1 000 000 000 💰 na Twoim koncie. Twoje saldo zostało zresetowane do 0.\n` +
  `🚨 Proszę natychmiast zgłosić błąd do administracji. Jeśli błąd nie zostanie zgłoszony w ciągu 30 minut, zostanie nałożona czarna lista (black lista).`;

async function checkAndResetBalance(client, senderId, senderUser, text, event, pageId) {
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
        return { triggered: true };
      }

      return { triggered: false };
    });
    console.log(`[BALANCE-CHECK] Result for ${senderId}: triggered=${balanceCheck.triggered}`);
  } catch (err) {
    console.error('[BALANCE-CHECK] Błąd podczas sprawdzania salda:', err);
  }

  if (balanceCheck.triggered) {
    const message = createMessageContext(client, senderUser, text, [], event, pageId);
    await message.reply(RESET_NOTIFICATION).catch(() => null);
    return true;
  }

  return false;
}

module.exports = { checkAndResetBalance };
