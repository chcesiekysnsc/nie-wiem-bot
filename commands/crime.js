const config = require('../config/config');
const { formatCurrency, recordGame, refreshBadges, ensureInventoryRecord, randomInt, msToReadable, getCrimeSuccessMultiplier, hasItem, getGlobalIncomeMultiplier, getGlobalCooldownReduction } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');
const { hasReputationBonus } = require('../utils/gangAI');
const { getItemSetBonus } = require('../utils/itemSets');

const successLines = [
  'Uciekłeś z sejfem bez zostawienia śladów.',
  'Włamanie do kasyna się udało.',
  'Plan z podrobionym biletem zadziałał idealnie.'
];

const failLines = [
  'Ochrona złapała Cię przy wyjściu.',
  'Kamery nagrały wszystko i zapłaciłeś karę.',
  'Alarm odpalił się za szybko i akcja spaliła na panewce.'
];

module.exports = {
  name: 'crime',
  aliases: [],
  async execute(client, message, args) {
    client.pendingBribes = client.pendingBribes || new Map();
    const authorId = message.author.id;
    const now = Date.now();

    // ==========================================
    // 1. PROCESS BRIBE OFFER (!crime lapowka)
    // ==========================================
    const sub = String(args && args[0] || '').toLowerCase().trim();
    if (sub === 'lapowka' || sub === 'łapówka' || sub === 'przekup') {
      const pending = client.pendingBribes.get(authorId);
      if (!pending) {
        await message.reply('❌ Nie masz żadnej aktywnej wpadki, za którą mógłbyś zaoferować łapówkę.');
        return;
      }

      // Clear the automatic timeout
      clearTimeout(pending.timeout);
      client.pendingBribes.delete(authorId);

      const bribeResult = await withData(store => {
        const user = createUser(authorId, store.users);
        const inventory = ensureInventoryRecord(store.inventory, authorId);

        const bribeCost = pending.bribeCost;
        if (user.balance < bribeCost) {
          // Charged standard penalty and jailed since they spent the bribe money in the meantime
          user.balance -= pending.amount;
          user.jailUntil = Date.now() + 60 * 60 * 1000;
          recordGame(user, -pending.amount, 25, inventory);
          refreshBadges(user, inventory);
          return { error: `❌ Nie masz już wystarczającej ilości gotówki na łapówkę (${formatCurrency(bribeCost)}). Zapłaciłeś standardową karę i trafiłeś do więzienia: **-${formatCurrency(pending.amount)}**.` };
        }

        // 45% chance of refusal
        const refused = Math.random() < 0.45;

        if (refused) {
          user.balance -= bribeCost;
          user.jailUntil = Date.now() + 60 * 60 * 1000; // 1 hour jail
          recordGame(user, -bribeCost, 25, inventory);
          refreshBadges(user, inventory);
          return { success: false, bribeCost, jailUntil: user.jailUntil };
        } else {
          const payout = Math.floor(pending.amount * 0.5);
          user.balance -= bribeCost;
          user.balance += payout;
          const net = payout - bribeCost;
          recordGame(user, net, 25, inventory);
          refreshBadges(user, inventory);
          return { success: true, bribeCost, payout, net };
        }
      });

      if (bribeResult.error) {
        await message.reply(bribeResult.error);
        return;
      }

      if (bribeResult.success) {
        await message.reply(
          `👮 **Policjant przyjął łapówkę! Unikasz więzienia!**\n` +
          `💸 Zapłaciłeś łapówkę **-${formatCurrency(bribeResult.bribeCost)}**, ale policjant oddał Ci połowę łapu: **+${formatCurrency(bribeResult.payout)}**.\n` +
          `📉 Strata netto: **${formatCurrency(Math.abs(bribeResult.net))}**.`
        );
      } else {
        await message.reply(
          `👮 **Policjant ODMÓWIŁ przyjęcia łapówki!**\n` +
          `💸 Straciłeś całą zaoferowaną kwotę łapówki: **-${formatCurrency(bribeResult.bribeCost)}**.\n` +
          `⛓️ Trafiasz do więzienia na **1 GODZINĘ**!\n` +
          `⚠️ Nie możesz teraz pracować (**!work**), brać udziału w skokach (**!gang skok**) oraz okradać innych (**!rob**).`
        );
      }
      return;
    }

    // ==========================================
    // 2. CHECK JAIL STATUS
    // ==========================================
    const isJailed = await withData(store => {
      const user = createUser(authorId, store.users);
      if (user.jailUntil && user.jailUntil > now) {
        return user.jailUntil;
      }
      return null;
    });

    if (isJailed) {
      const diffMs = isJailed - now;
      await message.reply(`❌ Jesteś w więzieniu! Odzyskasz wolność za **${msToReadable(diffMs)}**.`);
      return;
    }

    // ==========================================
    // 3. EXECUTE NORMAL CRIME
    // ==========================================
    const crimeSuccessOverride = await getEffectiveChance(authorId, 'crime_success');

    const result = await withData(store => {
      const user = createUser(authorId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, authorId);

      let baseSuccessChance = Number.isFinite(crimeSuccessOverride) ? crimeSuccessOverride / 100 : 0.50;
      const crimeMul = getCrimeSuccessMultiplier();
      if (crimeMul !== 1) {
        baseSuccessChance = Math.min(baseSuccessChance * crimeMul, 1);
      }
      if (user.badges) {
        if (user.badges.includes(config.badges.boss)) {
          baseSuccessChance += 0.05;
        } else if (user.badges.includes(config.badges.zastepca)) {
          baseSuccessChance += 0.03;
        } else if (user.badges.includes(config.badges.czlonek)) {
          baseSuccessChance += 0.015;
        }
      }
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId] && hasReputationBonus(store.profiles.gangs[user.gangId], 300)) {
        baseSuccessChance += 0.02;
      }
      const crimeCatchReduction = getItemSetBonus(inventory, 'crime_catch_reduction');
      if (crimeCatchReduction > 0) {
        baseSuccessChance += crimeCatchReduction;
      }
      const { getTerritoryBonus } = require('../utils/territories');
      if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const crimeChanceBonus = getTerritoryBonus(user.gangId, 'crime_chance');
        baseSuccessChance += crimeChanceBonus;
      }
      const roll = Math.random();
      let success = roll < Math.min(baseSuccessChance, 1);
      let amount = randomInt(5000, 30000);
      if (hasItem(inventory, 'krolewskie_insygnia')) {
        amount = Math.floor(amount * 1.10);
      }

      const hasOdznakaKomendanta = hasItem(inventory, 'odznaka_komendanta');
      let savedByBadge = false;
      if (hasOdznakaKomendanta && !success) {
        const finalChance = Math.min(baseSuccessChance + 0.125, 1);
        if (roll < finalChance) {
          success = true;
          savedByBadge = true;
        }
      }

      // Gang bonus
      let gangBonus = 0;
      if (success && user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const fachLvl = gang.levelFach || 0;
        const multipliers = [1.0, 1.04, 1.08, 1.12];
        const multiplier = multipliers[fachLvl] || 1.0;
        if (fachLvl > 0) {
          gangBonus = [0, 4, 8, 12][fachLvl] || 0;
        }
        amount = Math.floor(amount * multiplier);
        if (hasReputationBonus(gang, 700)) {
          amount = Math.floor(amount * 1.05);
        }
        const crimeRewardBonus = getTerritoryBonus(user.gangId, 'crime_reward');
        if (crimeRewardBonus > 0) {
          amount = Math.floor(amount * (1 + crimeRewardBonus));
        }
      }

      const globalIncomeBonus = getGlobalIncomeMultiplier(inventory);
      if (globalIncomeBonus > 0 && success) {
        amount = Math.floor(amount * (1 + globalIncomeBonus));
      }

      // Tribute
      let tribute = 0;
      if (success && user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
        const gang = store.profiles.gangs[user.gangId];
        const tributePercent = gang.tributePercent || 0;
        const isExcluded = user.gangRole === 'boss' || user.gangRole === 'deputy';
        if (tributePercent > 0 && !isExcluded) {
          tribute = Math.floor(amount * (tributePercent / 100));
        }
      }

      if (success) {
        const netAmount = amount - tribute;
        user.balance += netAmount;
        if (tribute > 0) {
          const gang = store.profiles.gangs[user.gangId];
          const bossUser = createUser(gang.bossId, store.users);
          bossUser.balance += tribute;
        }
        const xpResult = recordGame(user, netAmount, 25, inventory);
        refreshBadges(user, inventory);
        return {
          success: true,
          amount: netAmount,
          tribute,
          gangBonus,
          xpResult,
          text: successLines[Math.floor(Math.random() * successLines.length)],
          savedByBadge
        };
      } else {
        // Check if user has enough balance to cover a bribe (2 * amount)
        const canBribe = user.balance >= (amount * 2);
        return {
          success: false,
          amount,
          canBribe,
          text: failLines[Math.floor(Math.random() * failLines.length)]
        };
      }
    });

    if (result.success) {
      const bonusText = result.gangBonus ? ` (w tym **+${result.gangBonus}%** z fachu gangu)` : '';
      let replyText = '';
      if (result.tribute > 0) {
        replyText = `🎭 Napad: ${result.text} Zysk: **+${formatCurrency(result.amount)}**${bonusText} (pobrano **${formatCurrency(result.tribute)}** haraczu dla Bossa)`;
      } else {
        replyText = `🎭 Napad: ${result.text} Zysk: **+${formatCurrency(result.amount)}**${bonusText}`;
      }

      if (result.savedByBadge) {
        replyText += `\n🎖️ Odznaka Komendanta uratowała Cię przed aresztowaniem!`;
      }

      if (result.xpResult && result.xpResult.leveledUp) {
        replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${result.xpResult.newLevel}**!`;
        if (result.xpResult.milestonesGained && result.xpResult.milestonesGained.length > 0) {
          const { getMilestoneRewardDescription } = require('../utils/economy');
          for (const lvl of result.xpResult.milestonesGained) {
            replyText += `\n🎁 Otrzymałeś nagrodę kamienia milowego za poziom **${lvl}**: **${getMilestoneRewardDescription(lvl)}**!`;
          }
        }
      }
      await message.reply(replyText);
    } else {
      if (result.canBribe) {
        // Set up pending bribe in memory
        const timeout = setTimeout(async () => {
          const pending = client.pendingBribes.get(authorId);
          if (pending) {
            client.pendingBribes.delete(authorId);

            // Commit standard penalty and jail them by default since they did not offer a bribe
            await withData(store => {
              const user = createUser(authorId, store.users);
              const inventory = ensureInventoryRecord(store.inventory, authorId);
              user.balance -= pending.amount;
              user.jailUntil = Date.now() + 60 * 60 * 1000; // default jail
              recordGame(user, -pending.amount, 25, inventory);
              refreshBadges(user, inventory);
            });

            await message.reply(
              `⌛ **Czas na decyzję minął!** Zapłaciłeś karę **-${formatCurrency(pending.amount)}** i trafiasz do więzienia na **1 godzinę**!`
            );
          }
        }, 15000);

        client.pendingBribes.set(authorId, {
          amount: result.amount,
          bribeCost: result.amount * 2,
          timeout
        });

        await message.reply(
          `🚔 Wpadka! ${result.text}\n` +
          `Masz **15 sekund** na próbę uniknięcia więzienia:\n` +
          `👉 Wpisz **!crime lapowka**, aby przekupić policjanta za **${formatCurrency(result.amount * 2)}** (szansa na sukces: 55%).\n` +
          `Jeśli odmówią lub minie czas, na pewno trafisz do więzienia na **1 godzinę** i zapłacisz karę!`
        );
      } else {
        // Apply normal penalty and jail directly
        const penaltyResult = await withData(store => {
          const user = createUser(authorId, store.users);
          const inventory = ensureInventoryRecord(store.inventory, authorId);
          user.balance -= result.amount;
          user.jailUntil = Date.now() + 60 * 60 * 1000; // default jail
          const xpRes = recordGame(user, -result.amount, 25, inventory);
          refreshBadges(user, inventory);
          return { xpResult: xpRes };
        });

        let replyText = `🚔 Wpadka: ${result.text} Strata: **-${formatCurrency(result.amount)}**.\n` +
          `⛓️ Trafiasz do więzienia na **1 godzinę** (brak środków na łapówkę).`;
        if (penaltyResult.xpResult && penaltyResult.xpResult.leveledUp) {
          replyText += `\n🎉 **AWANS!** Awansowałeś na **poziom ${penaltyResult.xpResult.newLevel}**!`;
        }
        await message.reply(replyText);
      }
    }
  }
};
