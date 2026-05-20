const config = require('../config/config');
const { formatCurrency, refreshBadges, ensureInventoryRecord } = require('../utils/economy');
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
      await message.reply('❌ Użyj: `!rob @osoba` lub `!rob <id>`');
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

      if (victim.balance < 1000) {
        return { error: `❌ ${targetName} ma za mało kasy (min. ${formatCurrency(1000)} w portfelu).` };
      }

      // Kłódka zablokowana (musi być ręcznie aktywowana przez ofiarę - user.klodkaActive)
      if (victim.klodkaActive) {
        victim.klodkaActive = false; // zużyj aktywowaną kłódkę
        refreshBadges(victim, victimInv);
        return { blocked: true };
      }

      // Piwo (musi być ręcznie aktywowane przez złodzieja - user.piwoActive)
      const hasBeer = robber.piwoActive || false;
      if (hasBeer) {
        robber.piwoActive = false; // zużyj aktywne piwo
      }

      // Szanse: 60% sukces, 40% wpadka
      const success = Math.random() < 0.60;

      if (success) {
        const percent = hasBeer ? 0.25 : 0.20;
        const stolen = Math.max(1, Math.floor(victim.balance * percent));
        victim.balance -= stolen;
        robber.balance += stolen;
        robber.gamesPlayed += 1;
        refreshBadges(robber, robberInv);
        refreshBadges(victim, victimInv);
        return { success: true, stolen, beer: hasBeer };
      } else {
        const losePercent = hasBeer ? 0.40 : 0.30;
        const fine = Math.max(1, Math.floor(robber.balance * losePercent));
        robber.balance -= fine;
        victim.balance += fine;
        robber.gamesPlayed += 1;
        refreshBadges(robber, robberInv);
        refreshBadges(victim, victimInv);
        return { success: false, fine, beer: hasBeer };
      }
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    if (result.blocked) {
      await message.reply(`🔒 Kradzież zablokowana! **${targetName}** miał aktywną kłódkę.`);
      return;
    }

    // Ustaw cooldowny
    robCooldowns.set(authorId, now + 30 * 60 * 1000); // 30min
    if (!result.success) {
      caughtBan.set(authorId, now + 60 * 60 * 1000);    // 1h ban
    }

    if (result.success) {
      const beerNote = result.beer ? ' (Wypite Piwo +25%!)' : '';
      await message.reply(`💰 Rob udany! Ukradłeś **${formatCurrency(result.stolen)}** od **${targetName}**.${beerNote}`);
    } else {
      const beerNote = result.beer ? ' (Wypite Piwo -40%!)' : '';
      await message.reply(`🚔 Wpadka! Policja Cię złapała. Tracisz **${formatCurrency(result.fine)}** na rzecz **${targetName}**. Ban na okradanie: 1h.${beerNote}`);
    }
  }
};
