const config = require('../config/config');

function getWorkerDef(id) {
  return config.economy.workers && config.economy.workers[id] ? { id, ...config.economy.workers[id] } : null;
}

function applyWorkerEffects(payout, workers, compDef, companyObj, inventory, breakChanceOverride) {
  if (!workers || workers.length === 0) {
    return { payout, workerSalary: 0, totalBreakChanceBonus: 0, instantRepair: false, repairDiscount: false, broke: false, bonusTriggered: false, skipSalary: false };
  }

  let totalSalaryPercent = 0;
  let totalBreakChanceBonus = 0;
  let bonusChance = 0;
  let bonusPercent = 0;
  let skipSalary = false;
  let instantRepair = false;
  let repairDiscount = false;
  let doubleBonus = false;

  for (const wid of workers) {
    const def = getWorkerDef(wid);
    if (!def) continue;

    totalSalaryPercent += def.salaryPercent;
    totalBreakChanceBonus += def.breakChanceBonus;
    bonusChance += def.bonusChance;
    bonusPercent += def.bonusPercent;

    if (def.skipSalaryChance && Math.random() < def.skipSalaryChance) {
      skipSalary = true;
    }
    if (def.instantRepairChance && Math.random() < def.instantRepairChance) {
      instantRepair = true;
    }
    if (def.repairDiscountChance && Math.random() < def.repairDiscountChance) {
      repairDiscount = true;
    }
    if (def.doubleBonusChance && Math.random() < def.doubleBonusChance) {
      doubleBonus = true;
    }
  }

  let bonusTriggered = false;
  if (bonusChance > 0 && Math.random() < bonusChance) {
    bonusTriggered = true;
    if (doubleBonus) {
      payout = Math.floor(payout * (1 + bonusPercent * 2));
    } else {
      payout = Math.floor(payout * (1 + bonusPercent));
    }
  }

  let workerSalary = 0;
  if (!skipSalary) {
    workerSalary = Math.floor(payout * totalSalaryPercent);
    payout -= workerSalary;
  }

  if (instantRepair && companyObj.isBroken) {
    companyObj.isBroken = false;
  }

  let broke = false;
  if (!companyObj.isBroken) {
    let breakChance = compDef.breakChance + totalBreakChanceBonus;
    if (breakChanceOverride !== undefined && breakChanceOverride !== null && breakChanceOverride !== '' && Number(breakChanceOverride) !== 50) {
      breakChance = Number(breakChanceOverride) / 100;
    }
    broke = Math.random() < breakChance;
    if (broke) {
      companyObj.isBroken = true;
    }
  }

  return { payout, workerSalary, totalBreakChanceBonus, instantRepair, repairDiscount, broke, bonusTriggered, skipSalary };
}

module.exports = {
  getWorkerDef,
  applyWorkerEffects
};
