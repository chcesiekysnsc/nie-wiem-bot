const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, hasItem, getPassiveMultiplier } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');

const robCooldowns = new Map();   // userId -> timestamp wolny od kiedy
const caughtBan = new Map();      // userId -> timestamp do kiedy zbanowany

async function resolveName(client, userId) {
  if (typeof client.resolveUserName === 'function') {
    return await client.resolveUserName(userId);
  }
  return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
}

module.exports = {
  name: 'rob',
  aliases: ['okradnij'],
  robCooldowns,
  caughtBan,
  async execute(client, message, args) {
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

    if (robCheck.totalCmds < 50) {
      await message.reply(`❌ Musisz trochę pograć, zanim będziesz mógł okradać innych.`);
      return;
    }

    // Sprawdź ban po wpadce
    const banUntil = caughtBan.get(authorId) || 0;
    if (now < banUntil) {
      const left = Math.ceil((banUntil - now) / 60000);
      await message.reply(`🚔 Policja Cię obserwuje! Możesz spróbować ponownie za **${left} min**.`);
      return;
    }

    // Sprawdź cooldown 30min (lub 22.5min dla Cień Nocy, 25.5min dla Szwajcarskiego Zegarka)
    const { hasCienNocy, hasSzwajcar } = await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, authorId);
      return {
        hasCienNocy: hasItem(inv, 'cien_nocy'),
        hasSzwajcar: hasItem(inv, 'szwajcarski_zegarek')
      };
    });
    let robCooldownDuration = 30 * 60 * 1000;
    if (hasCienNocy) {
      robCooldownDuration = Math.floor(robCooldownDuration * 0.75);
    }
    if (hasSzwajcar) {
      robCooldownDuration = Math.floor(robCooldownDuration * 0.85);
    }

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
      if (store.profiles.blacklist && store.profiles.blacklist.includes(targetId)) {
        return { error: '❌ Ten użytkownik jest zablokowany i nie możesz wchodzić z nim w interakcje.' };
      }

      const robber = createUser(authorId, store.users);
      const victim = createUser(targetId, store.users);
      const victimInv = ensureInventoryRecord(store.inventory, targetId);
      const robberInv = ensureInventoryRecord(store.inventory, authorId);
      const victimLastActiveThreadId = victim.lastActiveThreadId || null;

      if (robber.gangId && victim.gangId) {
        if (robber.gangId === victim.gangId) {
          return { error: '❌ Nie możesz okraść członka swojego własnego gangu!' };
        }
        const robberGang = store.profiles.gangs && store.profiles.gangs[robber.gangId];
        if (robberGang && robberGang.alliances && robberGang.alliances.includes(victim.gangId)) {
          const victimGang = store.profiles.gangs[victim.gangId];
          const victimGangName = victimGang ? victimGang.name : 'sojuszniczego gangu';
          return { error: `❌ Nie możesz okradać członków sojuszniczego gangu (**${victimGangName}**)!` };
        }
      }

      if (robber.balance < 100000) {
        return { error: `❌ Musisz posiadać minimum ${formatCurrency(100000)} w portfelu, aby móc kogoś okraść.` };
      }

      let stealableBalance = victim.balance;
      if (victim.activeLoan) {
        stealableBalance = Math.max(0, victim.balance - victim.activeLoan.originalAmount);
      }

      if (stealableBalance < 1000) {
        return { error: `❌ ${targetName} ma za mało kasy (min. ${formatCurrency(1000)} w portfelu).` };
      }

      // Bomba (musi być ręcznie aktywowana przez ofiarę - user.bombaActive)
      if (victim.bombaActive) {
        victim.bombaActive = false; // zużyj aktywowaną bombę
        const fine = Math.floor(robber.balance * 0.40);
        robber.balance -= fine;
        victim.balance += fine;

        refreshBadges(robber, robberInv);
        refreshBadges(victim, victimInv);
        return { blockedBy: 'bomba', fine, victimLastActiveThreadId };
      }

      // Kłódka zablokowana (musi być ręcznie aktywowana przez ofiarę - user.klodkaActive)
      if (victim.klodkaActive) {
        victim.klodkaActive = false; // zużyj aktywowaną kłódkę
        refreshBadges(victim, victimInv);
        return { blockedBy: 'klodka', victimLastActiveThreadId };
      }

      // Piwo (musi być ręcznie aktywowane przez złodzieja - user.piwoActive)
      const hasBeer = robber.piwoActive || false;
      if (hasBeer) {
        robber.piwoActive = false; // zużyj aktywne piwo
      }

      // Szanse: 60% sukces, 40% wpadka. Krwawy Żeton daje +6%. Odznaka Zwycięzca daje +5%
      const robberHasZeton = hasItem(robberInv, 'krwawy_zeton');
      let baseSuccessChance = robberHasZeton ? 0.66 : 0.60;
      if (Number.isFinite(robSuccessOverride)) {
        baseSuccessChance = robSuccessOverride / 100;
      }
      if (robber.badges && robber.badges.includes(config.badges.zwyciezca)) {
        baseSuccessChance += 0.05;
      }

      const wlamywaczBonus = getPassiveMultiplier(robberInv, 'zestaw_wlamywacza', 0.03);
      baseSuccessChance += wlamywaczBonus;

      const alarmBonus = getPassiveMultiplier(victimInv, 'alarm', 0.04);
      baseSuccessChance -= alarmBonus;

      const success = Math.random() < Math.min(baseSuccessChance, 1);

      const latarkaBonusPct = getPassiveMultiplier(robberInv, 'latarka', 0.02);
      const kominiarkaBonusPct = getPassiveMultiplier(robberInv, 'kominiarka', 0.10);
      const piesBonusPct = getPassiveMultiplier(victimInv, 'pies_strozujacy', 0.05);

      if (success) {
        const percent = hasBeer ? 0.25 : 0.20;
        const baseStolen = Math.max(1, Math.floor(stealableBalance * percent));
        
        let bonusPercent = 0.0;
        let gangBonus = 0;
        if (robber.gangId && store.profiles.gangs && store.profiles.gangs[robber.gangId]) {
          const gang = store.profiles.gangs[robber.gangId];
          const fachLvl = gang.levelFach || 0;
          const multipliers = [0.0, 0.04, 0.08, 0.12];
          bonusPercent = multipliers[fachLvl] || 0.0;
          if (fachLvl > 0) {
            gangBonus = [0, 4, 8, 12][fachLvl] || 0;
          }
        }

        let stolen = Math.floor(baseStolen * (1 + bonusPercent));
        if (robberHasZeton) {
          stolen = Math.floor(stolen * 1.04);
        }

        let latarkaBonus = 0;
        if (latarkaBonusPct > 0) {
          latarkaBonus = Math.floor(stolen * latarkaBonusPct);
          stolen += latarkaBonus;
        }

        let sztyletBonus = 0;
        if (hasItem(robberInv, 'wampirzy_sztylet')) {
          sztyletBonus = Math.floor(stolen * 0.05);
        }

        let tribute = 0;
        if (robber.gangId && store.profiles.gangs && store.profiles.gangs[robber.gangId]) {
          const gang = store.profiles.gangs[robber.gangId];
          const tributePercent = gang.tributePercent || 0;
          const isExcluded = robber.gangRole === 'boss' || robber.gangRole === 'deputy';
          if (tributePercent > 0 && !isExcluded) {
            tribute = Math.floor(stolen * (tributePercent / 100));
          }
        }

        let insygniaBonus = 0;
        if (hasItem(robberInv, 'krolewskie_insygnia')) {
          insygniaBonus = Math.floor((stolen - tribute) * 0.10);
        }

        const netStolen = stolen - tribute + sztyletBonus + insygniaBonus;
        victim.balance = Math.max(0, victim.balance - (stolen + sztyletBonus));
        robber.balance += netStolen;

        if (tribute > 0) {
          const gang = store.profiles.gangs[robber.gangId];
          const bossUser = createUser(gang.bossId, store.users);
          bossUser.balance += tribute;
        }

        // Vampiric Dagger cooldown reset (limited to once per 12h)
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

        // Check Czarna Bandera for second robbery!
        let secondRob = null;
        const banderaPct = getPassiveMultiplier(robberInv, 'czarna_bandera', 0.05);
        if (banderaPct > 0 && Math.random() < banderaPct) {
          let secondStealable = victim.balance;
          if (victim.activeLoan) {
            secondStealable = Math.max(0, victim.balance - victim.activeLoan.originalAmount);
          }
          if (secondStealable >= 1000) {
            let secondSuccessChance = robberHasZeton ? 0.66 : 0.60;
            if (robber.badges && robber.badges.includes(config.badges.zwyciezca)) {
              secondSuccessChance += 0.05;
            }
            secondSuccessChance += wlamywaczBonus;
            secondSuccessChance -= alarmBonus;

            const secondSuccess = Math.random() < secondSuccessChance;
            if (secondSuccess) {
              const secondBaseStolen = Math.max(1, Math.floor(secondStealable * percent));
              let secondStolen = Math.floor(secondBaseStolen * (1 + bonusPercent));
              if (robberHasZeton) {
                secondStolen = Math.floor(secondStolen * 1.04);
              }
              let secondLatarka = 0;
              if (latarkaBonusPct > 0) {
                secondLatarka = Math.floor(secondStolen * latarkaBonusPct);
                secondStolen += secondLatarka;
              }
              let secondSztylet = 0;
              if (hasItem(robberInv, 'wampirzy_sztylet')) {
                secondSztylet = Math.floor(secondStolen * 0.05);
              }
              let secondTribute = 0;
              if (robber.gangId && store.profiles.gangs && store.profiles.gangs[robber.gangId]) {
                const gang = store.profiles.gangs[robber.gangId];
                const tributePercent = gang.tributePercent || 0;
                const isExcluded = robber.gangRole === 'boss' || robber.gangRole === 'deputy';
                if (tributePercent > 0 && !isExcluded) {
                  secondTribute = Math.floor(secondStolen * (tributePercent / 100));
                }
              }
              let secondInsygnia = 0;
              if (hasItem(robberInv, 'krolewskie_insygnia')) {
                secondInsygnia = Math.floor((secondStolen - secondTribute) * 0.10);
              }
              const secondNet = secondStolen - secondTribute + secondSztylet + secondInsygnia;
              victim.balance = Math.max(0, victim.balance - (secondStolen + secondSztylet));
              robber.balance += secondNet;

              if (secondTribute > 0) {
                const gang = store.profiles.gangs[robber.gangId];
                const bossUser = createUser(gang.bossId, store.users);
                bossUser.balance += secondTribute;
              }

              secondRob = { success: true, stolen: secondNet, tribute: secondTribute, sztyletBonus: secondSztylet, insygniaBonus: secondInsygnia };
            } else {
              let secondFine = Math.max(1, Math.floor(robber.balance * losePercent));
              if (robberHasZeton) {
                secondFine = Math.floor(secondFine * 1.08);
              }
              if (kominiarkaBonusPct > 0) {
                secondFine = Math.floor(secondFine * (1 - kominiarkaBonusPct));
              }
              let secondPies = 0;
              if (piesBonusPct > 0) {
                secondPies = Math.floor(secondFine * piesBonusPct);
              }
              const victimHasKamera = hasItem(victimInv, 'kamera');
              let secondPayout = victimHasKamera ? Math.floor(secondFine * 1.05) : secondFine;
              secondPayout += secondPies;

              robber.balance -= secondFine;
              victim.balance += secondPayout;

              secondRob = { success: false, fine: secondFine, payout: secondPayout, piesBonus: secondPies };
            }
          } else {
            secondRob = { error: 'Not enough balance' };
          }
        }

        robber.gamesPlayed += 1;
        refreshBadges(robber, robberInv);
        refreshBadges(victim, victimInv);
        return {
          success: true,
          stolen: netStolen,
          tribute,
          gangBonus,
          beer: hasBeer,
          victimLastActiveThreadId,
          robberHasZeton,
          sztyletBonus,
          sztyletResetTriggered,
          latarkaBonus,
          latarkaBonusPct,
          insygniaBonus,
          secondRob
        };
      } else {
        const losePercent = hasBeer ? 0.40 : 0.30;
        let fine = Math.max(1, Math.floor(robber.balance * losePercent));
        if (robberHasZeton) {
          fine = Math.floor(fine * 1.08);
        }
        if (kominiarkaBonusPct > 0) {
          fine = Math.floor(fine * (1 - kominiarkaBonusPct));
        }

        let piesBonus = 0;
        if (piesBonusPct > 0) {
          piesBonus = Math.floor(fine * piesBonusPct);
        }

        const victimHasKamera = hasItem(victimInv, 'kamera');
        let payout = victimHasKamera ? Math.floor(fine * 1.05) : fine;
        payout += piesBonus;

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
          robberHasZeton,
          victimHasKamera,
          kominiarkaBonusPct,
          piesBonusPct,
          piesBonus
        };
      }
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const robberName = await resolveName(client, authorId);
    const currentThreadId = message.guild?.id || message.rawEvent?.threadID;

    const sendWithMention = (body, targetName, targetId, threadId, replyToMessageId = null) => {
      if (!client.api || !threadId) return;
      const tag = `@${targetName}`;
      const bodyWithTag = body.replace(targetName, tag);
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
    };

    let replyMsg = '';
    let notifyMsg = '';

    const cdMinutes = Math.ceil(robCooldownDuration / 60000);
    if (result.blockedBy) {
      robCooldowns.set(authorId, now + robCooldownDuration);
      if (result.blockedBy === 'bomba') {
        replyMsg = `💣 **BUM!** Trafiłeś na bombę u użytkownika **${targetName}**! Straciłeś **40% swojego portfela** (**-${formatCurrency(result.fine)}**), które otrzymała ofiara. Cooldown na okradanie: ${cdMinutes} min.`;
        notifyMsg = `💣 **ALARM BOMBOWY!** Użytkownik **${robberName}** próbował okraść **${targetName}**, ale trafił na Twoją bombę! Stracił **40% portfela** (**+${formatCurrency(result.fine)}**) na Twoją rzecz!`;
      } else {
        replyMsg = `🔒 Kradzież zablokowana! **${targetName}** miał aktywną kłódkę. Cooldown na okradanie: ${cdMinutes} min.`;
        notifyMsg = `🔒 **ALARM!** Użytkownik **${robberName}** próbował okraść **${targetName}**, ale Twoja kłódka go powstrzymała!`;
      }
    } else {
      // Ustaw cooldowny
      robCooldowns.set(authorId, now + robCooldownDuration);
      if (!result.success) {
        caughtBan.set(authorId, now + 60 * 60 * 1000);    // 1h ban
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
            caughtBan.set(authorId, now + 60 * 60 * 1000); // 1h ban
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

    // Wyślij odpowiedź w bieżącym wątku
    if (replyMsg) {
      sendWithMention(replyMsg, targetName, targetId, currentThreadId, message.rawEvent.messageID);
    }

    // Wyślij powiadomienie na inną grupę
    if (notifyMsg && client.api) {
      const targetThreadId = result.victimLastActiveThreadId;
      if (targetThreadId && targetThreadId !== currentThreadId) {
        sendWithMention(notifyMsg, targetName, targetId, targetThreadId);
      }
    }
  }
};
