const config = require('../config/config');
const { getItemSetBonus } = require('./itemSets');

function getWorkerDef(id) {
  return config.economy.workers && config.economy.workers[id] ? { id, ...config.economy.workers[id] } : null;
}

function applyWorkerEffects(payout, workerId, compDef, companyObj, inventory, breakChanceOverride) {
  if (!workerId) {
    return { payout, workerSalary: 0, totalBreakChanceBonus: 0, instantRepair: false, repairDiscount: false, broke: false, bonusTriggered: false, skipSalary: false };
  }

  const def = getWorkerDef(workerId);
  if (!def) {
    return { payout, workerSalary: 0, totalBreakChanceBonus: 0, instantRepair: false, repairDiscount: false, broke: false, bonusTriggered: false, skipSalary: false };
  }

  let totalSalaryPercent = def.salaryPercent;
  let totalBreakChanceBonus = def.breakChanceBonus;
  let bonusChance = def.bonusChance;
  let bonusPercent = def.bonusPercent;
  let skipSalary = false;
  let instantRepair = false;
  let repairDiscount = false;
  let doubleBonus = false;

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

  let bonusTriggered = false;
  if (bonusChance > 0 && Math.random() < bonusChance) {
    bonusTriggered = true;
    if (doubleBonus) {
      payout = Math.floor(payout * (1 + bonusPercent * 2));
    } else {
      payout = Math.floor(payout * (1 + bonusPercent));
    }
  }

  // Dodaj bonus redukcji wypłaty pracowników z setów przedmiotów
  const salaryReduction = getItemSetBonus(inventory, 'worker_salary_reduction');
  if (salaryReduction > 0) {
    totalSalaryPercent = Math.max(0, totalSalaryPercent - salaryReduction);
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
    
    // Dodaj bonus z setów przedmiotów (np. Zestaw Biznesmena)
    const setBreakChanceBonus = getItemSetBonus(inventory, 'firm_break_chance');
    breakChance += setBreakChanceBonus;
    
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
