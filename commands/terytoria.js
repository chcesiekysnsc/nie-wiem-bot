const { loadData } = require('../utils/storage');
const { createUser } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');

function getTerritoryDefinitions() {
  const config = require('../config/config');
  return (config.territories && config.territories.definitions) || [];
}

function getTerritoryBonus(gang, bonusType) {
  const profiles = loadData('profiles');
  const territories = profiles.territories || {};
  const activeIds = territories.activeIds || [];
  const owners = territories.owners || {};
  const definitions = getTerritoryDefinitions();

  let totalBonus = 0;
  for (const def of definitions) {
    if (!activeIds.includes(def.id)) continue;
    if (owners[def.id] !== gang.id) continue;
    if (def.bonusType === bonusType) {
      totalBonus += def.bonusValue;
    } else if (def.bonusType === 'war_both' && (bonusType === 'gang_attack' || bonusType === 'gang_defense')) {
      totalBonus += def.bonusValue;
    } else if (def.bonusType === 'all_stats' && (bonusType === 'gang_attack' || bonusType === 'gang_defense' || bonusType === 'intel')) {
      totalBonus += def.bonusValue;
    } else if (def.bonusType === 'all_economy' && (bonusType === 'work' || bonusType === 'crime_reward' || bonusType === 'npc_raid')) {
      totalBonus += def.bonusValue;
    } else if (def.bonusType === 'reputation_gain') {
      totalBonus += def.bonusValue;
    }
  }
  return totalBonus;
}

function getTerritoryBonusText(gangId) {
  const profiles = loadData('profiles');
  const territories = profiles.territories || {};
  const activeIds = territories.activeIds || [];
  const owners = territories.owners || {};
  const definitions = getTerritoryDefinitions();
  const now = Date.now();
  const nextRotation = territories.nextRotationAt || 0;
  const lines = [];

  const owned = [];
  const free = [];
  for (const def of definitions) {
    if (!activeIds.includes(def.id)) continue;
    const ownerId = owners[def.id] || null;
    const ownerName = ownerId ? ((profiles.gangs && profiles.gangs[ownerId] ? profiles.gangs[ownerId].name : ownerId)) : 'Brak';
    const entry = { def, ownerId, ownerName };
    if (ownerId === gangId) {
      owned.push(entry);
    } else if (!ownerId) {
      free.push(entry);
    }
  }

  if (nextRotation > 0) {
    const diffMs = Math.max(0, nextRotation - now);
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const hrs = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
    const timeStr = [days ? `${days} dni` : null, hrs ? `${hrs} godzin` : null, mins ? `${mins} min` : null].filter(Boolean).join(' ');
    lines.push(`🌍 Aktywne terytoria:\nRotacja za: ${timeStr}\n`);
  } else {
    lines.push(`🌍 Aktywne terytoria:\n`);
  }

  let idx = 1;
  for (const entry of [...owned, ...free]) {
    const prefix = entry.ownerId === gangId ? '👑 ' : '';
    lines.push(`${idx}. ${prefix}${entry.def.emoji} **${entry.def.name}**`);
    lines.push(`   Właściciel: ${entry.ownerName}`);
    lines.push(`   Bonus: ${entry.def.description}`);
    if (entry.ownerId && entry.ownerId !== gangId) {
      lines.push(`   💡 Odbij: **!terytoria odbij ${idx}**`);
    } else if (!entry.ownerId) {
      lines.push(`   💡 Zajmij: **!terytoria odbij ${idx}**`);
    }
    lines.push('');
    idx++;
  }

  return lines.join('\n');
}

module.exports = {
  name: 'terytoria',
  aliases: ['territory', 'territories'],
  async execute(client, message, args) {
    const profiles = loadData('profiles');
    const users = loadData('users');
    const user = createUser(message.author.id, users);
    const gangId = user.gangId;
    const gang = (profiles.gangs || {})[gangId];

    if (!gang) {
      await message.reply('❌ Nie należysz do żadnego gangu.');
      return;
    }

    const sub = (args[0] || '').toLowerCase();
    if (sub === 'odbij' || sub === 'odbic') {
      const idx = parseInt(args[1], 10);
      if (!Number.isFinite(idx) || idx < 1) {
        await message.reply('❌ Użyj: **!terytoria odbij <numer>**');
        return;
      }

      const result = await require('../utils/storage').withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const myGang = store.profiles.gangs[gangId];
        if (!myGang) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const territories = store.profiles.territories || {};
        const activeIds = territories.activeIds || [];
        const owners = territories.owners || {};
        const definitions = getTerritoryDefinitions();

        const activeDefs = activeIds.map(id => definitions.find(d => d.id === id)).filter(Boolean);
        if (idx < 1 || idx > activeDefs.length) {
          return { error: '❌ Nieprawidłowy numer terytorium.' };
        }

        const targetDef = activeDefs[idx - 1];
        const currentOwner = owners[targetDef.id] || null;

        if (currentOwner === gangId) {
          return { error: '❌ Już posiadasz to terytorium.' };
        }

        if (currentOwner) {
          const defendingGang = store.profiles.gangs[currentOwner];
          if (defendingGang) {
            const myPower = myGang.members.length + require('../utils/gangAI').getMercenaryPowerBonus(myGang, 'attack');
            const defPower = defendingGang.members.length + require('../utils/gangAI').getMercenaryPowerBonus(defendingGang, 'defense');
            const winChance = myPower > 0 ? myPower / (myPower + defPower) : 0;
            if (Math.random() > winChance) {
              return { error: `❌ Próba odbicia **${targetDef.emoji} ${targetDef.name}** zakończyła się niepowodzeniem!` };
            }
          }
        }

        owners[targetDef.id] = gangId;
        store.profiles.territories = territories;
        return { success: true, name: targetDef.name, emoji: targetDef.emoji };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Pomyślnie odbiłeś terytorium **${result.emoji} ${result.name}**!`);
      return;
    }

    const text = getTerritoryBonusText(gang.id);
    if (!text) {
      await message.reply('❌ Brak aktywnych terytoriów.');
      return;
    }

    await message.reply(text);
  }
};
