const { infoEmbed } = require('../utils/embeds');
const {
  ensureInventoryRecord,
  formatCurrency,
  formatNumber,
  refreshBadges,
  xpForLevel
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'pfp',
  aliases: ['profile'],
  async execute(client, message) {
    const target = message.mentions.users.first() || message.author;
    const avatarUrl = target.displayAvatarURL({ size: 512, extension: 'png' });

    const profile = await withData(store => {
      const user = createUser(target.id, store.users);
      refreshBadges(user, ensureInventoryRecord(store.inventory, target.id));

      return {
        balance: user.balance,
        bank: user.bank,
        level: user.level,
        xp: user.xp,
        gamesPlayed: user.gamesPlayed,
        totalWon: user.totalWon,
        totalLost: user.totalLost,
        prestige: user.prestige,
        badges: user.badges,
        bio: user.bio,
        marriedTo: user.marriedTo
      };
    });

    const embed = infoEmbed('Profil gracza', profile.bio || `${target.username} w systemie JSON economy.`)
      .setAuthor({ name: target.tag, iconURL: avatarUrl })
      .setThumbnail(avatarUrl)
      .addFields(
        { name: 'Avatar', value: avatarUrl ? '[Kliknij avatar](' + avatarUrl + ')' : 'Brak dostepnego avataru.', inline: false },
        { name: 'Balance', value: formatCurrency(profile.balance), inline: true },
        { name: 'Bank', value: formatCurrency(profile.bank), inline: true },
        { name: 'Level', value: formatNumber(profile.level), inline: true },
        { name: 'XP', value: `${formatNumber(profile.xp)} / ${formatNumber(xpForLevel(profile.level, profile.prestige))}`, inline: true },
        { name: 'Games played', value: formatNumber(profile.gamesPlayed), inline: true },
        { name: 'Total won', value: formatCurrency(profile.totalWon), inline: true },
        { name: 'Total lost', value: formatCurrency(profile.totalLost), inline: true },
        { name: 'Prestige', value: formatNumber(profile.prestige), inline: true },
        { name: 'Badges', value: profile.badges.length ? profile.badges.join(', ') : 'Brak', inline: false }
      );

    if (profile.marriedTo) {
      const partner = typeof client.getUser === 'function' ? client.getUser(profile.marriedTo) : null;
      embed.addFields({ name: 'Married to', value: partner ? partner.tag : profile.marriedTo, inline: false });
    }

    await message.reply({ embeds: [embed] });
  }
};
