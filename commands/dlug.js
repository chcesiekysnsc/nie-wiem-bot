const { formatCurrency } = require('../utils/economy');
const { loadData } = require('../utils/storage');

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

function getDaysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T00:00:00Z');
  const b = new Date(dateStrB + 'T00:00:00Z');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function resolveDebtName(client, users, id) {
  return (users && users[id] && users[id].name) || (client.userNames && client.userNames.get(id)) || `Użytkownik_${String(id).slice(-6)}`;
}

module.exports = {
  name: 'dlug',
  aliases: ['dlugi', 'debts', 'debtors'],
  async execute(client, message, args) {
    const senderId = message.author.id;
    const action = String(args[0] || '').trim().toLowerCase();
    const targetUid = args[1] ? String(args[1]).trim() : null;

    const profiles = loadData('profiles');
    const users = loadData('users') || {};
    const loans = (profiles && profiles.playerLoans) ? profiles.playerLoans : [];

    if (loans.length === 0) {
      await message.reply('✅ Nie masz żadnych pożyczek — ani nie jesteś nikomu winien, ani nikt nie jest winien Tobie.');
      return;
    }

    const todayStr = getPolandDateString(new Date());

    const isList = action === 'lista';
    const isGracz = action === 'gracz' && targetUid;

    if (!isList && !isGracz) {
      const debtToOthers = loans
        .filter(l => l.borrowerId === senderId && l.amount > 0)
        .reduce((sum, l) => sum + l.amount, 0);
      const owedToSender = loans
        .filter(l => l.lenderId === senderId && l.amount > 0)
        .reduce((sum, l) => sum + l.amount, 0);

      const net = owedToSender - debtToOthers;
      const netText = net > 0 ? `+${formatCurrency(net)}` : (net < 0 ? `-${formatCurrency(Math.abs(net))}` : `${formatCurrency(0)}`);

      await message.reply(
        `📊 **Twoje długi — podsumowanie**\n\n` +
        `📉 Suma zadłużenia: **${formatCurrency(debtToOthers)} v**\n` +
        `📈 Suma wierzytelności: **${formatCurrency(owedToSender)} v**\n` +
        `⚖️ Bilans netto: **${netText} v**`
      );
      return;
    }

    let filtered = loans;
    if (isGracz) {
      const otherId = targetUid;
      filtered = loans.filter(l =>
        (l.lenderId === senderId && l.borrowerId === otherId) ||
        (l.lenderId === otherId && l.borrowerId === senderId)
      );
    } else if (isList) {
      filtered = loans.filter(l => l.lenderId === senderId || l.borrowerId === senderId);
    }

    if (filtered.length === 0) {
      await message.reply('✅ Nie masz żadnych pożyczek — ani nie jesteś nikomu winien, ani nikt nie jest winien Tobie.');
      return;
    }

    const iOwe = filtered.filter(l => l.borrowerId === senderId && l.amount > 0);
    const theyOwe = filtered.filter(l => l.lenderId === senderId && l.amount > 0);

    const lines = [];
    for (const loan of iOwe) {
      const lenderName = resolveDebtName(client, users, loan.lenderId);
      const nextDate = String(loan.nextCollectionDate || '');
      const overdueDays = nextDate ? getDaysBetween(todayStr, nextDate) : 0;
      let suffix = '';
      if (nextDate && nextDate < todayStr) {
        suffix = ` • ⚠️ opóźnienie: ${overdueDays} dni`;
        if (loan.status === 'defaulted') {
          suffix += ` (kara +${Math.round((loan.penaltyRate || 0) * 100)}% naliczona)`;
        }
      }
      lines.push(`├─ ${formatCurrency(loan.amount)} v → @${lenderName} • rata ${nextDate}${suffix}`);
    }

    for (const loan of theyOwe) {
      const borrowerName = resolveDebtName(client, users, loan.borrowerId);
      const nextDate = String(loan.nextCollectionDate || '');
      const overdueDays = nextDate ? getDaysBetween(todayStr, nextDate) : 0;
      let suffix = '';
      if (nextDate && nextDate < todayStr) {
        suffix = ` • ⚠️ opóźnienie: ${overdueDays} dni`;
        if (loan.status === 'defaulted') {
          suffix += ` (kara +${Math.round((loan.penaltyRate || 0) * 100)}% naliczona)`;
        }
      }
      lines.push(`└─ ${formatCurrency(loan.amount)} v ← @${borrowerName} • rata ${nextDate}${suffix}`);
    }

    const debtSum = iOwe.reduce((sum, l) => sum + l.amount, 0);
    const creditSum = theyOwe.reduce((sum, l) => sum + l.amount, 0);
    const net = creditSum - debtSum;
    const netText = net > 0 ? `+${formatCurrency(net)}` : (net < 0 ? `-${formatCurrency(Math.abs(net))}` : `${formatCurrency(0)}`);

    const header = isGracz
      ? `📊 Długi: Ty ↔ ${resolveDebtName(client, users, targetUid)}`
      : `📊 Twoje długi — szczegóły`;

    let response = `${header}\n\n`;
    if (iOwe.length > 0) {
      response += `🔴 Ty jesteś winien (${iOwe.length}):\n`;
      response += lines.slice(0, iOwe.length).join('\n') + '\n';
    }
    if (theyOwe.length > 0) {
      response += `🟢 Winni są Tobie (${theyOwe.length}):\n`;
      response += lines.slice(iOwe.length).join('\n') + '\n';
    }

    response += `\n━━━━━━━━━━━━━━\n`;
    response += `📉 Suma zadłużenia: **${formatCurrency(debtSum)} v**\n`;
    response += `📈 Suma wierzytelności: **${formatCurrency(creditSum)} v**\n`;
    response += `⚖️ Bilans netto: **${netText} v**`;

    await message.reply(response);
  }
};
