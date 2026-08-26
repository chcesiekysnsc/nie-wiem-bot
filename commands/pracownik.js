const config = require('../config/config');
const { formatCurrency, msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getWorkerDef } = require('../utils/workerEffects');

const WORKERS_ORDER = ['lary', 'alan', 'rafal', 'wojtek', 'eryk'];

function renderWorkerList(userWorkers) {
  const workers = config.economy.workers || {};
  let text = '👷 **PRACOWNICY (SYSTEM PRACOWNIKÓW)**\n';
  text += 'Kup pracownika, aby zwiększyć zyski z firmy!\n';
  text += '⚠️ Możesz zatrudnić tylko **1 pracownika**.\n\n';
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
  text += 'Sprzedaj pracownika: **!pracownik sprzedaj**';
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
        const workers = user.workers || [];
        if (workers.length > 0) {
          const wid = workers[0];
          const def = getWorkerDef(wid);
          const useCount = user.workerUseCount || 0;
          const totalPaid = user.workerTotalPayout || 0;
          const hiredAt = user.workerHiredAt || null;
          return { hasWorker: true, def, useCount, totalPaid, hiredAt };
        }
        return { hasWorker: false, workers: [] };
      });

      if (result.hasWorker && result.def) {
        let text = `👷 **TWÓJ PRACOWNIK**\n\n`;
        text += `**${result.def.stars} ${result.def.name}**\n`;
        text += `📊 **Statystyki:**\n`;
        if (result.hiredAt) {
          const timeHas = Date.now() - result.hiredAt;
          text += `   ↳ Masz go już od: **${msToReadable(timeHas)}**\n`;
        } else {
          text += `   ↳ Masz go już od: **nieznany czas**\n`;
        }
        text += `   ↳ Użyty w firmie: **${result.useCount}** razy\n`;
        text += `   ↳ Pobrana pensja przez pracownika: **${formatCurrency(result.totalPaid)}**\n`;
        text += `   ↳ Pobiera: **${Math.round(result.def.salaryPercent * 100)}%** wypłaty z firmy\n`;
        if (result.def.bonusChance > 0) {
          text += `   ↳ Bonus zarobków: **${Math.round(result.def.bonusChance * 100)}%** szans na +${Math.round(result.def.bonusPercent * 100)}%\n`;
        }
        if (result.def.breakChanceBonus > 0) {
          text += `   ↳ Szansa na awarię: **+${Math.round(result.def.breakChanceBonus * 100)}%**\n`;
        }
        text += `\n💡 Sprzedaj pracownika: **!pracownik sprzedaj**`;
        await message.reply(text);
        return;
      }

      await message.reply(renderWorkerList(result.workers));
      return;
    }

    if (action === 'sprzedaj' || action === 'sell') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.workers || user.workers.length === 0) {
          return { error: '❌ Nie posiadasz żadnego pracownika do sprzedania!' };
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
        user.workerHiredAt = null;
        user.workerUseCount = 0;
        user.workerTotalPayout = 0;

        return { success: true, totalRefund, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💸 Sprzedano pracownika za **${formatCurrency(result.totalRefund)}** (50% ceny zakupu).\n💰 Twój portfel: **${formatCurrency(result.balance)}**.`);
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

      if (user.workers && user.workers.length >= 1) {
        return { error: '❌ Możesz zatrudnić tylko 1 pracownika!' };
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
      user.workerHiredAt = Date.now();
      user.workerUseCount = 0;
      user.workerTotalPayout = 0;

      if (user.company) {
        user.company.lastPayout = Date.now() - 3 * 3600 * 1000;
      } else if (user.company2) {
        user.company2.lastPayout = Date.now() - 3 * 3600 * 1000;
      }

      return { success: true, workerDef, balance: user.balance };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`🎉 Pomyślnie zatrudniono **${result.workerDef.stars} ${result.workerDef.name}** za **${formatCurrency(result.workerDef.cost)}**!\n💰 Pozostało w portfelu: **${formatCurrency(result.balance)}**.\n💡 Możesz już odebrać wypłatę z efektyami pracownika komendą: **!firma zbierz**!`);
  }
};
