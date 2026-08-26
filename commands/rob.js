const config = require('../config/config');
const {
  formatCurrency,
  refreshBadges,
  ensureInventoryRecord,
  hasItem,
  getPassiveMultiplier,
  getItemUpgradeLevel,
  getGlobalCooldownReduction
} = require('../utils/economy');
const { getItemSetBonus } = require('../utils/itemSets');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { advanceChallenge } = require('../utils/challenges');

const robCooldowns = new Map();
const caughtBan = new Map();

async function resolveName(client, userId) {
  if (typeof client.resolveUserName === 'function') {
    return await client.resolveUserName(userId);
  }
  return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
}

function getGang(store, gangId) {
  if (!store || !store.profiles || !store.profiles.gangs || !gangId) return null;
  return store.profiles.gangs[gangId] || null;
}

function isSameGang(robber, victim) {
  return robber.gangId && victim.gangId && robber.gangId === victim.gangId;
}

function isAlliedGang(store, robberGangId, victimGangId) {
  const robberGang = getGang(store, robberGangId);
  if (!robberGang || !robberGang.alliances) return false;
  return robberGang.alliances.includes(victimGangId);
}

function getFachLevel(store, gangId) {
  const gang = getGang(store, gangId);
  if (!gang) return 0;
  return Math.max(0, Math.min(4, Math.floor(gang.levelFach || 0)));
}

function getTributePercent(store, gangId) {
  const gang = getGang(store, gangId);
  if (!gang) return 0;
  return Math.max(0, Math.min(100, Number(gang.tributePercent) || 0));
}

function getBossId(store, gangId) {
  const gang = getGang(store, gangId);
  if (!gang || !gang.bossId) return null;
  return String(gang.bossId);
}

function getRobCooldownDuration(inv, baseDuration) {
  let duration = baseDuration;
  if (hasItem(inv, 'cien_nocy')) {
    duration = Math.floor(duration * 0.75);
  }
  if (hasItem(inv, 'szwajcarski_zegarek')) {
    duration = Math.floor(duration * 0.85);
  }
  const reduction = getGlobalCooldownReduction(inv);
  if (reduction > 0) {
    duration = Math.floor(duration * (1 - reduction));
  }
  return Math.max(0, duration);
}

function calculateSuccessChance(robberInv, victimInv, robber, overrideChance, victim) {
  const robberHasZeton = hasItem(robberInv, 'krwawy_zeton');
  let chance = robberHasZeton ? 0.66 : 0.60;

  if (robberHasZeton) {
    const level = getItemUpgradeLevel(robberInv, 'krwawy_zeton');
    chance = 0.60 + (0.06 + level * 0.01);
  }

  if (Number.isFinite(overrideChance)) {
    chance = overrideChance / 100;
  }

  if (robber.badges && robber.badges.includes(config.badges.zwyciezca)) {
    chance += 0.05;
  }

  chance += getPassiveMultiplier(robberInv, 'zestaw_wlamywacza', 0.03);
  chance -= getPassiveMultiplier(victimInv, 'alarm', 0.04);
  chance -= getItemSetBonus(victimInv, 'catch_chance');
  
  // Dodaj bonus szansy robu z setów przedmiotów (np. Zestaw Złodzieja)
  const robChanceBonus = getItemSetBonus(robberInv, 'rob_chance');
  chance += robChanceBonus;

  if (victim && victim.badges && victim.badges.includes(config.badges.placzek)) {
    chance -= 0.10;
  }

  // Ochroniarze zmniejszają szanse na udane rob
  if (victim && victim.bodyguards && victim.bodyguards.length > 0) {
    const bodyguardDef = config.economy.bodyguards?.[victim.bodyguards[0]];
    if (bodyguardDef && bodyguardDef.robDefenseBonus) {
      chance -= bodyguardDef.robDefenseBonus;
    }
  }

  return Math.min(chance, 1);
}

function calculateStolenAmount(baseStolen, robberInv, gangFachLevel) {
  let stolen = baseStolen;
  const gangMultipliers = [0.0, 0.04, 0.08, 0.12];
  const gangBonus = [0, 4, 8, 12][gangFachLevel] || 0;
  stolen = Math.floor(stolen * (1 + (gangMultipliers[gangFachLevel] || 0)));

  if (hasItem(robberInv, 'krwawy_zeton')) {
    const level = getItemUpgradeLevel(robberInv, 'krwawy_zeton');
    stolen = Math.floor(stolen * (1 + 0.04 + level * 0.01));
  }

  const latarkaBonusPct = getPassiveMultiplier(robberInv, 'latarka', 0.02);
  if (latarkaBonusPct > 0) {
    stolen += Math.floor(stolen * latarkaBonusPct);
  }
  
  // Dodaj bonus łupu z setów przedmiotów (np. Zestaw Złodzieja)
  const robLootBonus = getItemSetBonus(robberInv, 'rob_loot');
  if (robLootBonus > 0) {
    stolen += Math.floor(stolen * robLootBonus);
  }
  
  // Dodaj bonus wcześniejszego przygotowania (50% większy łup)
  let wczesniejszePrzygotowanieTriggered = false;
  if (hasItem(robberInv, 'wczesniejsze_przygotowanie') && Math.random() < 0.02) {
    stolen = Math.floor(stolen * 1.5);
    wczesniejszePrzygotowanieTriggered = true;
  }

  let sztyletBonus = 0;
  if (hasItem(robberInv, 'wampirzy_sztylet')) {
    sztyletBonus = Math.floor(stolen * 0.05);
    stolen += sztyletBonus;
  }

  return { stolen, gangBonus, sztyletBonus, latarkaBonusPct, wczesniejszePrzygotowanieTriggered };
}

function calculateTribute(stolen, store, robber) {
  if (!robber.gangId) return 0;
  const tributePct = getTributePercent(store, robber.gangId);
  if (tributePct <= 0) return 0;
  const role = robber.gangRole || '';
  if (role === 'boss' || role === 'deputy') return 0;
  return Math.floor(stolen * (tributePct / 100));
}

function calculateInsygniaBonus(robberInv, netAfterTribute) {
  if (!hasItem(robberInv, 'krolewskie_insygnia')) return 0;
  return Math.floor(netAfterTribute * 0.10);
}

function calculateFailFine(robberBalance, robberInv, victimInv, beer, victim) {
  const losePercent = beer ? 0.40 : 0.30;
  let fine = Math.max(1, Math.floor(robberBalance * losePercent));

  if (hasItem(robberInv, 'krwawy_zeton')) {
    const level = getItemUpgradeLevel(robberInv, 'krwawy_zeton');
    fine = Math.floor(fine * (1 + 0.08 + level * 0.01));
  }

  const kominiarkaBonusPct = getPassiveMultiplier(robberInv, 'kominiarka', 0.10);
  if (kominiarkaBonusPct > 0) {
    fine = Math.floor(fine * (1 - kominiarkaBonusPct));
  }
  
  // Dodaj bonus ostrego noża (-5% kary)
  const ostryNozBonusPct = getPassiveMultiplier(robberInv, 'ostry_noz', 0.05);
  if (ostryNozBonusPct > 0) {
    fine = Math.floor(fine * (1 - ostryNozBonusPct));
  }
  
  // Dodaj bonus redukcji kary z setów przedmiotów (np. Zestaw Złodzieja)
  const robPenaltyReduction = getItemSetBonus(robberInv, 'rob_penalty_reduction');
  if (robPenaltyReduction > 0) {
    fine = Math.floor(fine * (1 - robPenaltyReduction));
  }

  const catchPenaltyBonus = getItemSetBonus(victimInv, 'catch_penalty');
  if (catchPenaltyBonus > 0) {
    fine = Math.floor(fine * (1 + catchPenaltyBonus));
  }

  if (victim && victim.badges && victim.badges.includes(config.badges.placzek)) {
    fine = Math.floor(fine * 1.05);
  }

  let payout = fine;
  if (hasItem(victimInv, 'kamera')) {
    payout = Math.floor(payout * 1.05);
  }

  const piesBonusPct = getPassiveMultiplier(victimInv, 'pies_strozujacy', 0.05);
  let piesBonus = 0;
  if (piesBonusPct > 0) {
    piesBonus = Math.floor(payout * piesBonusPct);
    payout += piesBonus;
  }

  if (hasItem(victimInv, 'patrol_policji')) {
    payout += Math.floor(fine * 0.15);
  }

  return { fine, payout, kominiarkaBonusPct, piesBonusPct, piesBonus };
}

function sendWithMention(client, body, targetName, targetId, threadId, replyToMessageId) {
  if (!client || !client.api || !threadId) return;
  const tag = `@${targetName}`;
  const bodyWithTag = String(body).replace(targetName, tag);
  const msgPayload = {
    body: bodyWithTag,
    mentions: [{
      tag: tag,
      id: targetId
    }]
  };
  if (replyToMessageId) {
    client.api.sendMessage(msgPayload, threadId, () => {}, replyToMessageId);
  } else {
    client.api.sendMessage(msgPayload, threadId);
  }
}

module.exports = {
  name: 'rob',
  aliases: ['okradnij'],
  robCooldowns,
  caughtBan,
  async execute(client, message, args) {
    try {
      const authorId = message.author.id;
      const now = Date.now();

      const robCheck = await withData(store => {
        const u = createUser(authorId, store.users);
        const totalCmds = Object.values(u.commandCounts || {}).reduce((a, b) => a + b, 0);
        return {
          jailUntil: (u.jailUntil && u.jailUntil > now) ? u.jailUntil : null,
          totalCmds
        };
      });

      if (robCheck.jailUntil) {
        const left = Math.ceil((robCheck.jailUntil - now) / 60000);
        await message.reply(`❌ Jesteś w więzieniu! Wyjdziesz za **${left} min**.`);
        return;
      }

      if (client.taxWarningActive) {
        await message.reply('❌ Nie możesz kraść podczas trwania ostrzeżenia przed poborem podatków. Wszystkie gry zostały zakończone.');
        return;
      }

      const isInActiveGame = 
        (client.activeBlackjackGames && client.activeBlackjackGames.has(authorId)) ||
        (client.activeChickenRoadGames && client.activeChickenRoadGames.has(authorId)) ||
        (client.meczInProgress && client.meczInProgress.has(authorId)) ||
        (client.activeMatches && client.activeMatches.has(authorId)) ||
        (client.activeMultiMatches && client.activeMultiMatches.has(authorId)) ||
        (client.stockSessions && Array.from(client.stockSessions.values()).some(s => s.participants?.has?.(authorId) || s.hostId === authorId)) ||
        (client.warSessions && Array.from(client.warSessions.values()).some(s => s.hostId === authorId || s.participants?.includes?.(authorId)));

      if (isInActiveGame) {
        await message.reply('❌ Nie możesz użyć !rob podczas trwania innej gry czasowej/turowej. Zakończ obecną grę lub poczekaj na jej automatyczne zakończenie.');
        return;
      }

      if (robCheck.totalCmds < 50) {
        await message.reply(`❌ Musisz trochę pograć, zanim będziesz mógł okradać innych.`);
        return;
      }

      const banUntil = caughtBan.get(authorId) || 0;
      if (now < banUntil) {
        const left = Math.ceil((banUntil - now) / 60000);
        await message.reply(`🚔 Policja Cię obserwuje! Możesz spróbować ponownie za **${left} min**.`);
        return;
      }

      const cooldownData = await withData(store => {
        const inv = ensureInventoryRecord(store.inventory, authorId);
        return {
          duration: getRobCooldownDuration(inv, 30 * 60 * 1000)
        };
      });

      const coolUntil = robCooldowns.get(authorId) || 0;
      if (now < coolUntil) {
        const left = Math.ceil((coolUntil - now) / 60000);
        await message.reply(`⏱️ Musisz poczekać jeszcze **${left} min**.`);
        return;
      }

      let targetId = null;
      let targetName = 'Cel';

      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
        targetName = mentioned.username || await resolveName(client, targetId);
      } else if (args[0] && /^\d+$/.test(args[0])) {
        targetId = args[0];
        targetName = await resolveName(client, targetId);
      }

      if (!targetId) {
        await message.reply('❌ Użyj: **!rob @osoba** lub **!rob <id>**');
        return;
      }

      if (targetId === authorId) {
        await message.reply('❌ Nie możesz okraść samego siebie.');
        return;
      }

      const robSuccessOverride = await getEffectiveChance(authorId, 'rob_success');

      const result = await withData(store => {
        try {
          if (store.profiles.blacklist && store.profiles.blacklist.includes(targetId)) {
            return { error: '❌ Ten użytkownik jest zablokowany i nie możesz wchodzić z nim w interakcje.' };
          }

          const robber = createUser(authorId, store.users);
          const victim = createUser(targetId, store.users);
          const robberInv = ensureInventoryRecord(store.inventory, authorId);
          const victimInv = ensureInventoryRecord(store.inventory, targetId);
          const victimLastActiveThreadId = victim.lastActiveThreadId || null;

          if (isSameGang(robber, victim)) {
            return { error: '❌ Nie możesz okraść członka swojego własnego gangu!' };
          }

          if (isAlliedGang(store, robber.gangId, victim.gangId)) {
            const victimGang = getGang(store, victim.gangId);
            const victimGangName = victimGang ? victimGang.name : 'sojuszniczego gangu';
            return { error: `❌ Nie możesz okradać członków sojuszniczego gangu (**${victimGangName}**)!` };
          }

          if (robber.balance < 100000) {
            return { error: `❌ Musisz posiadać minimum ${formatCurrency(100000)} w portfelu, aby móc kogoś okraść.` };
          }

          let stealableBalance = victim.balance;
          if (victim.activeLoan) {
            stealableBalance = Math.max(0, victim.balance - victim.activeLoan.originalAmount);
          }

          if (victim.balance < 50000) {
            return { error: `❌ ${targetName} ma za mało kasy (min. ${formatCurrency(50000)} w portfelu).` };
          }

          if (victim.bombaActive) {
            victim.bombaActive = false;
            const fine = Math.floor(robber.balance * 0.40);
            robber.balance -= fine;
            victim.balance += fine;
            refreshBadges(robber, robberInv);
            refreshBadges(victim, victimInv);
            
            // Sprawdź czy ofiara ma ochroniarza
            const { addItem } = require('../utils/economy');
            if (victim.bodyguards && victim.bodyguards.length > 0) {
              const bodyguardDef = config.economy.bodyguards?.[victim.bodyguards[0]];
              if (bodyguardDef && bodyguardDef.givesBrownPackageOnDefense) {
                const now = Date.now();
                const resetsAt = victim.brownPackageResetsAt || 0;
                let openedToday = victim.brownPackageCount || 0;
                if (now >= resetsAt) {
                  openedToday = 0;
                  victim.brownPackageResetsAt = now + 3 * 3600 * 1000;
                }
                if (openedToday < 2) {
                  addItem(store.inventory, victim.id, 'paczka_brazowa', 1);
                  victim.brownPackageCount = openedToday + 1;
                }
              }
              if (bodyguardDef && bodyguardDef.givesFreeKlodkaChance && Math.random() < bodyguardDef.givesFreeKlodkaChance) {
                addItem(store.inventory, victim.id, 'klodka', 1);
              }
            }
            
            return { blockedBy: 'bomba', fine, victimLastActiveThreadId };
          }

          if (victim.klodkaActive) {
            victim.klodkaActive = false;
            refreshBadges(victim, victimInv);
            const fine = Math.floor(robber.balance * 0.15);
            if (fine > 0) {
              robber.balance -= fine;
              victim.balance += fine;
            }
            
            // Sprawdź czy ofiara ma ochroniarza
            const { addItem } = require('../utils/economy');
            if (victim.bodyguards && victim.bodyguards.length > 0) {
              const bodyguardDef = config.economy.bodyguards?.[victim.bodyguards[0]];
              if (bodyguardDef && bodyguardDef.givesBrownPackageOnDefense) {
                const now = Date.now();
                const resetsAt = victim.brownPackageResetsAt || 0;
                let openedToday = victim.brownPackageCount || 0;
                if (now >= resetsAt) {
                  openedToday = 0;
                  victim.brownPackageResetsAt = now + 3 * 3600 * 1000;
                }
                if (openedToday < 2) {
                  addItem(store.inventory, victim.id, 'paczka_brazowa', 1);
                  victim.brownPackageCount = openedToday + 1;
                }
              }
              if (bodyguardDef && bodyguardDef.givesFreeKlodkaChance && Math.random() < bodyguardDef.givesFreeKlodkaChance) {
                addItem(store.inventory, victim.id, 'klodka', 1);
              }
            }
            
            return { blockedBy: 'klodka', fine, victimLastActiveThreadId };
          }

          const hasBeer = robber.piwoActive || false;
          if (hasBeer) {
            robber.piwoActive = false;
          }

          const chance = calculateSuccessChance(robberInv, victimInv, robber, robSuccessOverride, victim);
          const success = Math.random() < chance;

          const percent = hasBeer ? 0.25 : 0.20;
          const baseStolen = Math.max(1, Math.floor(stealableBalance * percent));

          if (success) {
            const gangFachLevel = getFachLevel(store, robber.gangId);
            const { stolen, gangBonus, sztyletBonus, latarkaBonusPct, wczesniejszePrzygotowanieTriggered } = calculateStolenAmount(baseStolen, robberInv, gangFachLevel);

            const tribute = calculateTribute(stolen, store, robber);

            let insygniaBonus = 0;
            const netBeforeInsygnia = stolen - tribute + sztyletBonus;
            insygniaBonus = calculateInsygniaBonus(robberInv, netBeforeInsygnia);
            const netStolen = netBeforeInsygnia + insygniaBonus;

            victim.balance = Math.max(0, victim.balance - (stolen + sztyletBonus));
            robber.balance += netStolen;

            if (tribute > 0) {
              const bossId = getBossId(store, robber.gangId);
              if (bossId) {
                const bossUser = createUser(bossId, store.users);
                bossUser.balance += tribute;
              }
            }

            let sztyletResetTriggered = false;
            if (hasItem(robberInv, 'wampirzy_sztylet')) {
              const lastReset = robber.lastSztyletResetTime || 0;
              const twelveHours = 12 * 60 * 60 * 1000;
              if (now - lastReset >= twelveHours) {
                robber.lastWorkTime = 0;
                if (store.cooldowns && store.cooldowns.commands && store.cooldowns.commands[authorId]) {
                  delete store.cooldowns.commands[authorId]['work'];
                  delete store.cooldowns.commands[authorId]['crime'];
                }
                robber.lastSztyletResetTime = now;
                sztyletResetTriggered = true;
              }
            }

            let secondRob = null;
            const banderaPct = getPassiveMultiplier(robberInv, 'czarna_bandera', 0.05);
            const losePercent = hasBeer ? 0.40 : 0.30;
            if (banderaPct > 0 && Math.random() < banderaPct) {
              let secondStealable = victim.balance;
              if (victim.activeLoan) {
                secondStealable = Math.max(0, victim.balance - victim.activeLoan.originalAmount);
              }
              if (secondStealable >= 1000) {
                const secondChance = calculateSuccessChance(robberInv, victimInv, robber, robSuccessOverride, victim);
                const secondSuccess = Math.random() < secondChance;
                if (secondSuccess) {
                  const secondBase = Math.max(1, Math.floor(secondStealable * percent));
                  const secondResult = calculateStolenAmount(secondBase, robberInv, gangFachLevel);
                  const secondTribute = calculateTribute(secondResult.stolen, store, robber);
                  const secondNetBeforeInsygnia = secondResult.stolen - secondTribute + secondResult.sztyletBonus;
                  const secondInsygnia = calculateInsygniaBonus(robberInv, secondNetBeforeInsygnia);
                  const secondNet = secondNetBeforeInsygnia + secondInsygnia;

                  victim.balance = Math.max(0, victim.balance - (secondResult.stolen + secondResult.sztyletBonus));
                  robber.balance += secondNet;

                  if (secondTribute > 0) {
                    const bossId = getBossId(store, robber.gangId);
                    if (bossId) {
                      const bossUser = createUser(bossId, store.users);
                      bossUser.balance += secondTribute;
                    }
                  }

                  secondRob = {
                    success: true,
                    stolen: secondNet,
                    tribute: secondTribute,
                    sztyletBonus: secondResult.sztyletBonus,
                    insygniaBonus: secondInsygnia
                  };
                } else {
                  const secondFail = calculateFailFine(robber.balance, robberInv, victimInv, hasBeer, victim);
                  let secondFine = secondFail.fine;
                  if (hasItem(robberInv, 'krwawy_zeton')) {
                    const level = getItemUpgradeLevel(robberInv, 'krwawy_zeton');
                    secondFine = Math.floor(secondFine * (1 + 0.08 + level * 0.01));
                  }
                  const secondPayout = secondFail.payout;

                  robber.balance -= secondFine;
                  victim.balance += secondPayout;

                  secondRob = {
                    success: false,
                    fine: secondFine,
                    payout: secondPayout,
                    kominiarkaBonusPct: secondFail.kominiarkaBonusPct,
                    piesBonus: secondFail.piesBonus,
                    victimHasKamera: hasItem(victimInv, 'kamera')
                  };
                }
              } else {
                secondRob = { error: 'Not enough balance' };
              }
            }

            robber.gamesPlayed += 1;
            refreshBadges(robber, robberInv);
            refreshBadges(victim, victimInv);
            advanceChallenge(authorId, store, 'rob_count');
            return {
              success: true,
              stolen: netStolen,
              tribute,
              gangBonus,
              beer: hasBeer,
              victimLastActiveThreadId,
              robberHasZeton: hasItem(robberInv, 'krwawy_zeton'),
              sztyletBonus,
              sztyletResetTriggered,
              latarkaBonus: latarkaBonusPct > 0 ? Math.floor(stolen * latarkaBonusPct) : 0,
              latarkaBonusPct,
              insygniaBonus,
              wczesniejszePrzygotowanieTriggered,
              secondRob
            };
          } else {
            const failResult = calculateFailFine(robber.balance, robberInv, victimInv, hasBeer, victim);
            let fine = failResult.fine;
            const payout = failResult.payout;
            const kominiarkaBonusPct = failResult.kominiarkaBonusPct;
            const piesBonusPct = failResult.piesBonusPct;
            const piesBonus = failResult.piesBonus;

            robber.balance -= fine;
            victim.balance += payout;
            robber.gamesPlayed += 1;
            refreshBadges(robber, robberInv);
            refreshBadges(victim, victimInv);
            return {
              success: false,
              fine,
              payout,
              beer: hasBeer,
              victimLastActiveThreadId,
              robberHasZeton: hasItem(robberInv, 'krwawy_zeton'),
              victimHasKamera: hasItem(victimInv, 'kamera'),
              kominiarkaBonusPct,
              piesBonusPct,
              piesBonus
            };
          }
        } catch (err) {
          console.error('[ROB] Blad wewnatrz withData:', err);
          return { error: '❌ Wystąpił nieoczekiwany błąd podczas okradania.' };
        }
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      const robberName = await resolveName(client, authorId);
      const currentThreadId = message.guild?.id || message.rawEvent?.threadID;

      let replyMsg = '';
      let notifyMsg = '';

      const cdMinutes = Math.ceil(cooldownData.duration / 60000);
      if (result.blockedBy) {
        robCooldowns.set(authorId, now + cooldownData.duration);
        if (result.blockedBy === 'bomba') {
          replyMsg = `💣 **BUM!** Trafiłeś na bombę u użytkownika **${targetName}**! Straciłeś **40% swojego portfela** (**-${formatCurrency(result.fine)}**), które otrzymała ofiara. Cooldown na okradanie: ${cdMinutes} min.`;
          notifyMsg = `💣 **ALARM BOMBOWY!** Użytkownik **${robberName}** próbował okraść **${targetName}**, ale trafił na Twoją bombę! Stracił **40% portfela** (**+${formatCurrency(result.fine)}**) na Twoją rzecz!`;
        } else {
          replyMsg = `🔒 Kradzież zablokowana! **${targetName}** miał aktywną kłódkę. Straciłeś **15% swojego portfela** (**-${formatCurrency(result.fine)}**), które otrzymała ofiara. Cooldown na okradanie: ${cdMinutes} min.`;
          notifyMsg = `🔒 **ALARM!** Użytkownik **${robberName}** próbował okraść **${targetName}**, ale Twoja kłódka go powstrzymała! Otrzymałeś **15% jego portfela** (**+${formatCurrency(result.fine)}**).`;
        }
      } else {
        robCooldowns.set(authorId, now + cooldownData.duration);
        if (!result.success) {
          caughtBan.set(authorId, now + 60 * 60 * 1000);
        }

        if (result.success) {
          const beerNote = result.beer ? ' (Wypite Piwo +25%!)' : '';
          const zetonNote = result.robberHasZeton ? ' (Krwawy Żeton +4%!)' : '';

          let itemsUsedNotes = [];
          if (result.latarkaBonus) {
            itemsUsedNotes.push(`**+${formatCurrency(result.latarkaBonus)}** z 🔦 Latarki`);
          }
          if (result.sztyletBonus) {
            itemsUsedNotes.push(`**+${formatCurrency(result.sztyletBonus)}** z 🗡️ Wampirzego Sztyletu${result.sztyletResetTriggered ? ' (zresetowano cooldowny)' : ''}`);
          }
          if (result.insygniaBonus) {
            itemsUsedNotes.push(`**+${formatCurrency(result.insygniaBonus)}** z 👑 Królewskich Insygniów`);
          }
          if (result.wczesniejszePrzygotowanieTriggered) {
            itemsUsedNotes.push(`**+50%** z 📁 Wcześniejszego Przygotowania`);
          }
          const itemsNote = itemsUsedNotes.length > 0 ? ` (w tym ${itemsUsedNotes.join(' oraz ')})` : '';
          const bonusNote = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z fachu gangu)` : '';

          if (result.tribute > 0) {
            replyMsg = `💰 Rob udany! Ukradłeś **${formatCurrency(result.stolen)}** od **${targetName}**${bonusNote}${zetonNote}${itemsNote} (pobrano **${formatCurrency(result.tribute)}** haraczu dla Bossa).${beerNote}`;
          } else {
            replyMsg = `💰 Rob udany! Ukradłeś **${formatCurrency(result.stolen)}** od **${targetName}**${bonusNote}${zetonNote}${itemsNote}.${beerNote}`;
          }
          notifyMsg = `💰 **ALARM!** Użytkownik **${robberName}** okradł **${targetName}** na kwotę **${formatCurrency(result.stolen)}**!${bonusNote}${zetonNote}${itemsNote}${beerNote}`;

          if (result.secondRob) {
            if (result.secondRob.success) {
              const secStolen = result.secondRob.stolen;
              const secTribute = result.secondRob.tribute;
              const secSztylet = result.secondRob.sztyletBonus;
              const secInsygnia = result.secondRob.insygniaBonus || 0;
              let secNote = `\n🏴 **Czarna Bandera: DRUGI NAPAD!** Napad udany! Dodatkowo ukradłeś **${formatCurrency(secStolen)}** od **${targetName}**`;
              if (secTribute > 0) {
                secNote += ` (pobrano **${formatCurrency(secTribute)}** haraczu dla Bossa)`;
              }
              if (secSztylet > 0) {
                secNote += ` (w tym **+${formatCurrency(secSztylet)}** ze Sztyletu)`;
              }
              if (secInsygnia > 0) {
                secNote += ` (w tym **+${formatCurrency(secInsygnia)}** z Insygniów)`;
              }
              replyMsg += secNote;
              notifyMsg += `\n🏴 **DRUGI NAPAD!** Złodziej uderzył ponownie i ukradł dodatkowe **+${formatCurrency(secStolen)}**!`;
            } else if (result.secondRob.success === false) {
              const secFine = result.secondRob.fine;
              const secPayout = result.secondRob.payout;
              caughtBan.set(authorId, now + 60 * 60 * 1000);
              let secNote = `\n🏴 **Czarna Bandera: DRUGI NAPAD!** Wpadka! Zostałeś złapany i tracisz dodatkowe **${formatCurrency(secFine)}** na rzecz **${targetName}**. Ban na okradanie: 1h.`;
              replyMsg += secNote;
              notifyMsg += `\n🏴 **DRUGI NAPAD!** Napastnik zaatakował ponownie, ale wpadł! Otrzymujesz dodatkowe zadośćuczynienie w wysokości **+${formatCurrency(secPayout)}**!`;
            }
          }
        } else {
          const beerNote = result.beer ? ' (Wypite Piwo -40%!)' : '';
          const zetonNote = result.robberHasZeton ? ' (w tym **+8%** kary z Krwawego Żetonu)' : '';

          let failNotes = [];
          if (result.kominiarkaBonusPct > 0) {
            const pct = Math.round(result.kominiarkaBonusPct * 100);
            failNotes.push(`kara zmniejszona o **${pct}%** dzięki 🥷 Kominiarce`);
          }
          const robberFailNote = failNotes.length > 0 ? ` (${failNotes.join(', ')})` : '';

          let victimFailNotes = [];
          if (result.victimHasKamera) {
            victimFailNotes.push(`**+5%** z Kamery`);
          }
          if (result.piesBonus > 0) {
            victimFailNotes.push(`**+${formatCurrency(result.piesBonus)}** z 🐕 Psa Stróżującego`);
          }
          const victimNote = victimFailNotes.length > 0 ? ` (w tym ${victimFailNotes.join(' oraz ')})` : '';

          replyMsg = `🚔 Wpadka! Policja Cię złapała. Tracisz **${formatCurrency(result.fine)}** na rzecz **${targetName}**${zetonNote}${robberFailNote}. Ban na okradanie: 1h.${beerNote}`;
          notifyMsg = `🚔 **ALARM!** Użytkownik **${robberName}** próbował okraść **${targetName}**, ale wpadł i policja oddała Ci zadośćuczynienie w wysokości **+${formatCurrency(result.payout)}**!${victimNote}${beerNote}`;
        }
      }

      if (replyMsg) {
        if (currentThreadId) {
          sendWithMention(client, replyMsg, targetName, targetId, currentThreadId, message.rawEvent?.messageID);
        } else {
          await message.reply(replyMsg);
        }
      }

      if (notifyMsg && client.api) {
        const targetThreadId = result.victimLastActiveThreadId;
        if (targetThreadId && targetThreadId !== currentThreadId) {
          sendWithMention(client, notifyMsg, targetName, targetId, targetThreadId);
        }
      }
    } catch (error) {
      console.error('[ROB] Blad komendy:', error);
      try {
        await message.reply('❌ Wystąpił nieoczekiwany błąd podczas okradania. Spróbuj ponownie później.');
      } catch (_) {}
    }
  }
};
