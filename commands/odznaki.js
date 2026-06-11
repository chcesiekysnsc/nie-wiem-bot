const config = require('../config/config');
const { createUser, withData } = require('../utils/storage');
const { refreshBadges, ensureInventoryRecord } = require('../utils/economy');

const badgeGroups = [
  {
    nr: 1,
    name: 'Hazard',
    badges: [
      { name: '🎲 Hazardzista', desc: '+0.5% szans na wygraną w kasynie', req: 'Wygranie łącznie 1 000 000 💰 w grach' },
      { name: '🎰 Rekin Kasyna', desc: '+1% szans na wygraną w kasynie', req: 'Wygranie łącznie 50 000 000 💰 w grach' },
      { name: '🃏 Bóg Kasyna', desc: '+1.5% szans na wygraną w kasynie', req: 'Wygranie łącznie 250 000 000 💰 w grach' }
    ]
  },
  {
    nr: 2,
    name: 'Bogactwo',
    badges: [
      { name: '🪙 Bogacz', desc: '+0.5% odsetek z banku', req: 'Posiadanie łącznie 500 000 💰 (portfel + bank)' },
      { name: '💸 Milioner', desc: '+1% odsetek, +25k miejsca w banku', req: 'Posiadanie łącznie 5 000 000 💰 (portfel + bank)' },
      { name: '💎 Miliarder', desc: '+2% odsetek, +50k miejsca w banku', req: 'Posiadanie łącznie 30 000 000 💰 (portfel + bank)' }
    ]
  },
  {
    nr: 3,
    name: 'Granie',
    badges: [
      { name: '🔨 Gracz', desc: '+5% XP z gier', req: 'Rozegranie łącznie 400 gier' },
      { name: '⚡ Weteran', desc: '+8% XP z gier', req: 'Rozegranie łącznie 2 500 gier' },
      { name: '🌀 Uzależniony', desc: '+12% XP z gier, +3% do wygranych (zysk)', req: 'Rozegranie łącznie 12 000 gier' }
    ]
  },
  {
    nr: 4,
    name: 'Wiadomości',
    badges: [
      { name: '💬 Gadatliwy', desc: '+4% do !daily', req: 'Wysłanie łącznie 5 000 wiadomości' },
      { name: '🗣️ Spamer', desc: '+8% do !daily', req: 'Wysłanie łącznie 25 000 wiadomości' },
      { name: '📢 Król Spamu', desc: '+12% do !daily, +5% do !work', req: 'Wysłanie łącznie 120 000 wiadomości' }
    ]
  },
  {
    nr: 5,
    name: 'Komendy',
    badges: [
      { name: '⌨️ Klikacz', desc: '-3% czasu cooldownów', req: 'Użycie łącznie 500 komend' },
      { name: '🤖 Władca Bota', desc: '-5% czasu cooldownów', req: 'Użycie łącznie 10 000 komend' }
    ]
  },
  {
    nr: 6,
    name: 'Zwycięstwa',
    badges: [
      { name: '🏆 Zwycięzca', desc: '+5% szans sukcesu w !rob', req: 'Wygranie łącznie 500 gier (wins)' }
    ]
  },
  {
    nr: 7,
    name: 'Małżeństwo',
    badges: [
      { name: '💍 Małżeństwo', desc: '+2% do !daily dla obojga partnerów', req: 'Posiadanie aktywnego małżeństwa (!marry)' }
    ]
  },
  {
    nr: 8,
    name: 'Gangi',
    badges: [
      { name: '👤 Członek gangu', desc: '+1.5% szans sukcesu w !crime', req: 'Bycie członkiem gangu' },
      { name: '⭐ Zastępca', desc: '+3% szans w !crime, +2.5% do skoków gangu', req: 'Rola Zastępcy w gangu' },
      { name: '👑 Boss gangu', desc: '+5% szans w !crime, +5% do skoków gangu', req: 'Rola Bossa w gangu' }
    ]
  },
  {
    nr: 9,
    name: 'Poziomy',
    badges: [
      { name: '📈 Nowicjusz', desc: 'Odznaka poziomu (kosmetyczna)', req: 'Osiągnięcie poziomu 20' },
      { name: '🔥 Ekspert', desc: 'Odznaka poziomu (kosmetyczna)', req: 'Osiągnięcie poziomu 50' },
      { name: '👑 Mistrz', desc: 'Odznaka poziomu (kosmetyczna)', req: 'Osiągnięcie poziomu 80' }
    ]
  },
  {
    nr: 10,
    name: 'VIP',
    badges: [
      { name: '👑 VIP', desc: 'Status VIP (kosmetyczna odznaka)', req: 'Posiadanie przedmiotu VIP Pass w ekwipunku' }
    ]
  }
];

module.exports = {
  name: 'odznaki',
  aliases: ['odznaka', 'badges'],
  async execute(client, message, args) {
    const authorId = message.author.id;
    const authorBadges = await withData(store => {
      const u = createUser(authorId, store.users);
      const inv = ensureInventoryRecord(store.inventory, authorId);
      refreshBadges(u, inv);
      return u.badges || [];
    });

    const hasBadge = (badgeName) => {
      const normalized = badgeName.trim().toLowerCase();
      return authorBadges.some(b => b.trim().toLowerCase() === normalized);
    };

    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'help' || !isNaN(Number(args[0]))) {
      let nr = Number(args[0]);
      if (sub === 'help') {
        nr = Number(args[1]);
      }

      if (isNaN(nr) || nr < 1 || nr > badgeGroups.length) {
        await message.reply(`❌ Podaj poprawny numer grupy (1-${badgeGroups.length}). Wpisz **!odznaki**, aby zobaczyć listę.`);
        return;
      }

      const group = badgeGroups.find(g => g.nr === nr);
      let response = `ℹ️ **Szczegółowy opis odznak z grupy ${group.nr} (${group.name}):**\n\n`;

      for (const badge of group.badges) {
        const statusStr = hasBadge(badge.name) ? ' [✅ POSIADASZ]' : ' [❌ BRAK]';
        response += `• **${badge.name}**${statusStr}\n  - Opis: *${badge.desc}*\n  - Wymaga: *${badge.req}*\n\n`;
      }

      await message.reply(response.trim());
      return;
    }

    let response = `🏅 **Lista grup odznak i ich bonusy:**\n\n`;
    for (const group of badgeGroups) {
      const firstBadge = group.badges[0].name.replace(/^\S+\s+/, '').trim();
      const firstHas = hasBadge(group.badges[0].name) ? ' [✅]' : '';
      response += `${group.nr}. ${firstBadge.toLowerCase()}${firstHas}\n`;
      for (let i = 1; i < group.badges.length; i++) {
        const otherBadge = group.badges[i].name.replace(/^\S+\s+/, '').trim();
        const otherHas = hasBadge(group.badges[i].name) ? ' [✅]' : '';
        response += `-${otherBadge.toLowerCase()}${otherHas}\n`;
      }
      const shortDesc = group.badges.map(b => `${b.name.split(' ')[0]} ${b.desc}`).join(', ');
      response += `*Bonusy:* ${shortDesc}\n\n`;
    }

    response += `\n💡 Aby zobaczyć dokładne wymagania i opis grupy odznak, wpisz:\n**!odznaki help <nr>** (np. **!odznaki help 1**)`;
    await message.reply(response);
  }
};
