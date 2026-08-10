const { formatCurrency } = require('../utils/economy');
const { loadData } = require('../utils/storage');

const TAX_BRACKETS = [
  { min: 0, max: 500_000, rate: 0, label: 'do 500k' },
  { min: 500_000, max: 2_000_000, rate: 0.05, label: '500k-2mln' },
  { min: 2_000_000, max: 10_000_000, rate: 0.08, label: '2mln-10mln' },
  { min: 10_000_000, max: 50_000_000, rate: 0.12, label: '10mln-50mln' },
  { min: 50_000_000, max: 100_000_000, rate: 0.18, label: '50mln-100mln' },
  { min: 100_000_000, max: Infinity, rate: 0.25, label: '100mln+' }
];

function calculateProgressiveTax(wealth, hasKsiegowa = false) {
  let tax = 0;
  let topLabel = TAX_BRACKETS[0].label;
  for (const bracket of TAX_BRACKETS) {
    if (wealth <= bracket.min) break;
    const taxableInThisBracket = Math.min(wealth, bracket.max) - bracket.min;
    const effectiveRate = hasKsiegowa ? Math.max(0, bracket.rate - 0.02) : bracket.rate;
    tax += taxableInThisBracket * effectiveRate;
    topLabel = bracket.label;
  }
  const topBracket = TAX_BRACKETS.find(b => b.label === topLabel);
  const rawRate = topBracket ? topBracket.rate : 0;
  const effectiveRate = hasKsiegowa ? Math.max(0, rawRate - 0.02) : rawRate;
  return { tax: Math.round(tax), topLabel, rate: effectiveRate };
}

function getBracketInfo(wealth) {
  for (const bracket of TAX_BRACKETS) {
    if (wealth <= bracket.max) {
      return { label: bracket.label, rate: bracket.rate };
    }
  }
  return { label: '100mln+', rate: 0.25 };
}

module.exports = {
  name: 'podatki',
  aliases: ['podatek', 'tax'],
  async execute(client, message, args) {
    const senderId = message.author.id;

    const profiles = loadData('profiles') || {};
    const users = loadData('users') || {};
    const inventory = loadData('inventory') || {};
    const user = users[senderId] || {};
    const userInv = inventory[senderId] || {};

    const balance = Number(user.balance || 0);
    const bank = Number(user.bank || 0);
    const wealth = balance + bank;

    const hasKsiegowa = (userInv['dobra_ksiegowa'] || 0) > 0;

    const nextAt = Number(profiles.nextTaxCollectionAt || 0);
    const now = Date.now();
    const remainingMs = Math.max(0, nextAt - now);
    const remainingMin = Math.floor(remainingMs / 60000);
    const remainingHours = Math.floor(remainingMin / 60);
    const remainingMinutes = remainingMin % 60;

    const { tax, topLabel, rate } = calculateProgressiveTax(wealth, hasKsiegowa);
    const ksiegowaNote = hasKsiegowa ? '\n👩‍💼 **Dobra Księgowa** — stawki obniżone o 2%!' : '';

    if (wealth < 500_000) {
      await message.reply(
        `💰 **Twój podatek majątkowy**\n\n` +
        `📊 Majątek: **${formatCurrency(wealth)} v**\n` +
        `✅ Jesteś poniżej progu wolnego od podatku (500 000 v)\n` +
        `Nie zapłacisz nic przy najbliższym poborze.\n\n` +
        `⏳ Następny pobór za: ${remainingHours}h ${remainingMinutes}min` +
        ksiegowaNote
      );
      return;
    }

    await message.reply(
      `💰 **Twój podatek majątkowy**\n\n` +
      `📊 Majątek: **${formatCurrency(wealth)} v**\n` +
      `📈 Twój próg: **${topLabel}** (${Math.round(rate * 100)}%/6h)\n\n` +
      `⏳ Następny pobór za: ${remainingHours}h ${remainingMinutes}min\n` +
      `💸 Szacowany podatek: ≈**${formatCurrency(tax)} v**\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `ℹ️ Podatek jest progresywny — płacisz wyższą stawkę tylko od nadwyżki w każdym progu, nie od całości.` +
      ksiegowaNote
    );
  }
};
