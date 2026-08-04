const config = require('../config/config');
const { formatCurrency } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const WORKERS_ORDER = ['lary', 'alan', 'rafal', 'wojtek', 'eryk'];

function getWorkerDef(id) {
  return config.economy.workers && config.economy.workers[id] ? { id, ...config.economy.workers[id] } : null;
}

function renderWorkerList(userWorkers) {
  const workers = config.economy.workers || {};
  let text = '👷 **PRACOWNICY (SYSTEM PRACOWNIKÓW)**\n';
  text += 'Kup pracowników, aby zwiększyć zyski z firmy!\n\n';
  text += '📋 **Oferta pracowników:**\n';

  let i = 1;
  for (const id of WORKERS_ORDER) {
    const def = getWorkerDef(id);
    if (!def) continue;

    const owned = userWorkers.includes(id);
    const breakPct = Math.round(def.breakChanceBonus * 100);
    const salaryPct = Math.round(def.salaryPercent * 100);
    const bonusPct = Math.round(def.bonusChance * 100);
    const bonusAmount = Math.round(def.bonusPercent * 100);

    text += `**${i}. ${def.stars} ${def.name}**\n`;
    text += `   ↳ Cena: **${formatCurrency(def.cost)}**\n`;
    text += `   ↳ Pobiera: **${salaryPct}%** wypłaty z firmy\n`;
    text += `   ↳ Szansa na awarię: **+${breakPct}%**\n`;
    text += `   ↳ Bonus zarobków: **${bonusPct}%** szans na +${bonusAmount}%\n`;
    if (def.doubleBonusChance) {
      text += `   ↳ Podwojenie bonusu: **${Math.round(def.doubleBonusChance * 100)}%**\n`;
    }
    if (def.repairDiscountChance) {
      text += `   ↳ Tania naprawa: **${Math.round(def.repairDiscountChance * 100)}%**\n`;
    }
    if (def.instantRepairChance) {
      text += `   ↳ Natychmiastowa naprawa: **${Math.round(def.instantRepairChance * 100)}%**\n`;
    }
    if (def.skipSalaryChance) {
      text += `   ↳ Szansa na niepobranie wypłaty: **${Math.round(def.skipSalaryChance * 100)}%**\n`;
    }
    text += owned ? `   ↳ Status: ✅ **POSIADASZ**\n\n` : `\n`;
    i++;
  }

  text += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  text += 'Kup pracownika wpisując: **!pracownik <numer>**\n';
  text += 'Sprzedaj wszystkich pracowników: **!pracownik sprzedaj**';
  return text;
}

module.exports = {
  name: 'pracownik',
  aliases: ['pracownicy', 'worker'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();

    if (!action) {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        return { workers: user.workers || [] };
      });

      await message.reply(renderWorkerList(result.workers));
      return;
    }

    if (action === 'sprzedaj' || action === 'sell') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.workers || user.workers.length === 0) {
          return { error: '❌ Nie posiadasz żadnych pracowników do sprzedania!' };
        }

        let totalRefund = 0;
        const workersDef = config.economy.workers || {};
        for (const wid of user.workers) {
          const def = getWorkerDef(wid);
          if (def) {
            totalRefund += Math.floor(def.cost * 0.5);
          }
        }

        user.balance += totalRefund;
        user.workers = [];

        return { success: true, totalRefund, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💸 Sprzedano wszystkich pracowników za **${formatCurrency(result.totalRefund)}** (50% ceny zakupu).\n💰 Twój portfel: **${formatCurrency(result.balance)}**.`);
      return;
    }

    const workerNum = parseInt(action, 10);
    const workersDef = config.economy.workers || {};
    if (isNaN(workerNum) || workerNum < 1 || workerNum > WORKERS_ORDER.length) {
      await message.reply(`❌ Podaj numer pracownika 1-${WORKERS_ORDER.length}. Napisz **!pracownik**, aby zobaczyć listę.`);
      return;
    }

    const workerId = WORKERS_ORDER[workerNum - 1];
    const workerDef = getWorkerDef(workerId);
    if (!workerDef) {
      await message.reply('❌ Nie znaleziono takiego pracownika!');
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);

      if (!user.company && !user.company2) {
        return { error: '❌ Musisz najpierw posiadać firmę, aby zatrudnić pracownika! Kup firmę za pomocą **!firma kup <nr>**.' };
      }

      if (user.workers && user.workers.includes(workerId)) {
        return { error: `❌ Już zatrudniłeś **${workerDef.name}**!` };
      }

      if (user.balance < workerDef.cost) {
        return { error: `❌ Brak wystarczających środków w portfelu! Cena to **${formatCurrency(workerDef.cost)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
      }

      user.balance -= workerDef.cost;
      user.workers = user.workers || [];
      user.workers.push(workerId);

      return { success: true, workerDef, balance: user.balance };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`🎉 Pomyślnie zatrudniono **${result.workerDef.stars} ${result.workerDef.name}** za **${formatCurrency(result.workerDef.cost)}**!\n💰 Pozostało w portfelu: **${formatCurrency(result.balance)}**.`);
  }
};
