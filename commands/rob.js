const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord, hasItem } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const robCooldowns = new Map();   // userId -> timestamp wolny od kiedy
const caughtBan = new Map();      // userId -> timestamp do kiedy zbanowany

module.exports = {
  name: 'rob',
  aliases: ['okradnij'],
  async execute(client, message, args) {
    const authorId = message.author.id;
    const now = Date.now();

    // Sprawdź ban po wpadce
    const banUntil = caughtBan.get(authorId) || 0;
    if (now < banUntil) {
      const left = Math.ceil((banUntil - now) / 60000);
      await message.reply(`🚔 Policja Cię obserwuje! Możesz spróbować ponownie za **${left} min**.`);
      return;
    }

    // Sprawdź cooldown 30min
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
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = args[0];
      targetName = `Uzytkownik_${targetId.slice(-6)}`;
      if (client.userNames.has(targetId)) {
        targetName = client.userNames.get(targetId);
      }
    }

    if (!targetId) {
      await message.reply('❌ Użyj: **!rob @osoba** lub **!rob <id>**');
      return;
    }

    if (targetId === authorId) {
      await message.reply('❌ Nie możesz okraść samego siebie.');
      return;
    }

    const result = await withData(store => {
      if (store.profiles.blacklist && store.profiles.blacklist.includes(targetId)) {
        return { error: '❌ Ten użytkownik jest zablokowany i nie możesz wchodzić z nim w interakcje.' };
      }

      const robber = createUser(authorId, store.users);
      const victim = createUser(targetId, store.users);
      const victimInv = ensureInventoryRecord(store.inventory, targetId);
      const robberInv = ensureInventoryRecord(store.inventory, authorId);
      const victimLastActiveThreadId = victim.lastActiveThreadId || null;

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

      // Szanse: 60% sukces, 40% wpadka. Krwawy Żeton daje +6%
      const robberHasZeton = hasItem(robberInv, 'krwawy_zeton');
      const baseSuccessChance = robberHasZeton ? 0.66 : 0.60;
      const success = Math.random() < baseSuccessChance;

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

        let tribute = 0;
        if (robber.gangId && store.profiles.gangs && store.profiles.gangs[robber.gangId]) {
          const gang = store.profiles.gangs[robber.gangId];
          const tributePercent = gang.tributePercent || 0;
          const isExcluded = robber.gangRole === 'boss' || robber.gangRole === 'deputy';
          if (tributePercent > 0 && !isExcluded) {
            tribute = Math.floor(stolen * (tributePercent / 100));
          }
        }

        const netStolen = stolen - tribute;
        victim.balance -= baseStolen;
        robber.balance += netStolen;

        if (tribute > 0) {
          const gang = store.profiles.gangs[robber.gangId];
          const bossUser = createUser(gang.bossId, store.users);
          bossUser.balance += tribute;
        }

        robber.gamesPlayed += 1;
        refreshBadges(robber, robberInv);
        refreshBadges(victim, victimInv);
        return { success: true, stolen: netStolen, tribute, gangBonus, beer: hasBeer, victimLastActiveThreadId, robberHasZeton };
      } else {
        const losePercent = hasBeer ? 0.40 : 0.30;
        let fine = Math.max(1, Math.floor(robber.balance * losePercent));
        if (robberHasZeton) {
          fine = Math.floor(fine * 1.08);
        }
        const victimHasKamera = hasItem(victimInv, 'kamera');
        const payout = victimHasKamera ? Math.floor(fine * 1.05) : fine;
        robber.balance -= fine;
        victim.balance += payout;
        robber.gamesPlayed += 1;
        refreshBadges(robber, robberInv);
        refreshBadges(victim, victimInv);
        return { success: false, fine, payout, beer: hasBeer, victimLastActiveThreadId, robberHasZeton, victimHasKamera };
      }
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const robberName = message.author.username || `Użytkownik_${authorId.slice(-6)}`;
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

    if (result.blockedBy) {
      robCooldowns.set(authorId, now + 30 * 60 * 1000); // 30min cooldown
      if (result.blockedBy === 'bomba') {
        replyMsg = `💣 **BUM!** Trafiłeś na bombę u użytkownika **${targetName}**! Straciłeś **40% swojego portfela** (**-${formatCurrency(result.fine)}**), które otrzymała ofiara. Cooldown na okradanie: 30 min.`;
        notifyMsg = `💣 **ALARM BOMBOWY!** Użytkownik **${robberName}** próbował okraść **${targetName}**, ale trafił na Twoją bombę! Stracił **40% portfela** (**+${formatCurrency(result.fine)}**) na Twoją rzecz!`;
      } else {
        replyMsg = `🔒 Kradzież zablokowana! **${targetName}** miał aktywną kłódkę. Cooldown na okradanie: 30 min.`;
        notifyMsg = `🔒 **ALARM!** Użytkownik **${robberName}** próbował okraść **${targetName}**, ale Twoja kłódka go powstrzymała!`;
      }
    } else {
      // Ustaw cooldowny
      robCooldowns.set(authorId, now + 30 * 60 * 1000); // 30min
      if (!result.success) {
        caughtBan.set(authorId, now + 60 * 60 * 1000);    // 1h ban
      }

      if (result.success) {
        const beerNote = result.beer ? ' (Wypite Piwo +25%!)' : '';
        const zetonNote = result.robberHasZeton ? ' (Krwawy Żeton +4%!)' : '';
        const bonusNote = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z fachu gangu)` : '';
        if (result.tribute > 0) {
          replyMsg = `💰 Rob udany! Ukradłeś **${formatCurrency(result.stolen)}** od **${targetName}**${bonusNote}${zetonNote} (pobrano **${formatCurrency(result.tribute)}** haraczu dla Bossa).${beerNote}`;
        } else {
          replyMsg = `💰 Rob udany! Ukradłeś **${formatCurrency(result.stolen)}** od **${targetName}**${bonusNote}${zetonNote}.${beerNote}`;
        }
        notifyMsg = `💰 **ALARM!** Użytkownik **${robberName}** okradł **${targetName}** na kwotę **${formatCurrency(result.stolen)}**!${bonusNote}${zetonNote}${beerNote}`;
      } else {
        const beerNote = result.beer ? ' (Wypite Piwo -40%!)' : '';
        const zetonNote = result.robberHasZeton ? ' (w tym **+8%** kary z Krwawego Żetonu)' : '';
        const kameraNote = result.victimHasKamera ? ' (w tym **+5%** z Twojej Kamery)' : '';
        const robberKameraNote = result.victimHasKamera ? ' (+5% bonusu z Kamery dla ofiary)' : '';
        replyMsg = `🚔 Wpadka! Policja Cię złapała. Tracisz **${formatCurrency(result.fine)}** na rzecz **${targetName}**${zetonNote}${robberKameraNote}. Ban na okradanie: 1h.${beerNote}`;
        notifyMsg = `🚔 **ALARM!** Użytkownik **${robberName}** próbował okraść **${targetName}**, ale wpadł i policja oddała Ci zadośćuczynienie w wysokości **+${formatCurrency(result.payout)}**!${kameraNote}${beerNote}`;
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
