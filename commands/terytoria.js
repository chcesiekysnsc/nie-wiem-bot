const { loadData } = require('../utils/storage');
const { createUser, withData } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');
const { getOrderedActiveTerritories, getTerritoryState } = require('../utils/territories');
const { resolveTerritoryConflict, getMercenaryPowerBonus } = require('../utils/gangAI');

function getTerritoryDefinitions() {
  const config = require('../config/config');
  return (config.territories && config.territories.definitions) || [];
}

function buildTerritoryListText(gangId) {
  const state = getTerritoryState();
  const ordered = getOrderedActiveTerritories(gangId);
  const now = Date.now();
  const nextRotation = state.nextRotationAt || 0;
  const lines = [];

  if (ordered.length === 0) return null;

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

  const profiles = loadData('profiles');
  ordered.forEach((entry, i) => {
    const idx = i + 1;
    const ownerName = entry.ownerId
      ? ((profiles.gangs && profiles.gangs[entry.ownerId]) ? profiles.gangs[entry.ownerId].name : entry.ownerId)
      : 'Brak';
    const prefix = entry.ownerId === gangId ? '👑 ' : '';
    lines.push(`${idx}. ${prefix}${entry.def.emoji} **${entry.def.name}**`);
    lines.push(`   Właściciel: ${ownerName}`);
    lines.push(`   Bonus: ${entry.def.description}`);
    if (entry.ownerId && entry.ownerId !== gangId) {
      lines.push(`   💡 Odbij: **!terytoria odbij ${idx}**`);
    } else if (!entry.ownerId) {
      lines.push(`   💡 Zajmij: **!terytoria odbij ${idx}**`);
    }
    lines.push('');
  });

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

    if (sub !== 'odbij' && sub !== 'odbic') {
      let text = buildTerritoryListText(gang.id);
      if (!text) {
        const definitions = getTerritoryDefinitions();
        if (definitions.length === 0) {
          await message.reply('❌ Brak zdefiniowanych terytoriów w konfiguracji.');
          return;
        }
        await withData(store => {
          const allIds = definitions.map(d => d.id);
          const shuffled = allIds.sort(() => Math.random() - 0.5);
          const initialActive = shuffled.slice(0, 5);
          const owners = {};
          for (const id of allIds) owners[id] = null;
          store.profiles.territories = { activeIds: initialActive, owners, nextRotationAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
        }).catch(() => {});
        text = buildTerritoryListText(gang.id);
        if (!text) {
          await message.reply('❌ Nie udało się zainicjować terytoriów. Spróbuj ponownie później.');
          return;
        }
      }
      await message.reply(text);
      return;
    }

    const idx = parseInt(args[1], 10);
    if (!Number.isFinite(idx) || idx < 1) {
      await message.reply('❌ Użyj: **!terytoria odbij <numer>** (numer zgodny z listą z !terytoria)');
      return;
    }

    const result = await withData(store => {
      store.profiles.gangs = store.profiles.gangs || {};
      const myGang = store.profiles.gangs[gangId];
      if (!myGang) {
        return { error: '❌ Nie należysz do żadnego gangu.' };
      }

      const ordered = getOrderedActiveTerritories(gangId);
      if (idx > ordered.length) {
        return { error: '❌ Nieprawidłowy numer terytorium.' };
      }

      const targetEntry = ordered[idx - 1];
      const targetDef = targetEntry.def;
      const currentOwner = targetEntry.ownerId;

      if (currentOwner === gangId) {
        return { error: '❌ Już posiadasz to terytorium.' };
      }

      const now = Date.now();
      const lastCapture = myGang.lastTerritoryCaptureAt || 0;
      if (lastCapture && now - lastCapture < 60 * 60 * 1000) {
        const leftSec = Math.ceil((60 * 60 * 1000 - (now - lastCapture)) / 1000);
        const mins = Math.floor(leftSec / 60);
        const secs = leftSec % 60;
        const leftStr = [mins ? `${mins} min` : null, secs ? `${secs}s` : null].filter(Boolean).join(' ');
        return { error: `⏳ Odwiedzenie terytorium zbyt szybko! Pozostało: **${leftStr}**` };
      }

      myGang.lastTerritoryCaptureAt = now;

      let conflictOutcome = null;
      let defendingGang = null;
      let defendingGangId = null;

      if (currentOwner) {
        defendingGangId = currentOwner;
        defendingGang = store.profiles.gangs[currentOwner];
        if (defendingGang) {
          conflictOutcome = resolveTerritoryConflict(
            myGang,
            defendingGang,
            myGang.members.length,
            defendingGang.members.length,
            myGang.members.length,
            defendingGang.members.length
          );

          if (!conflictOutcome.success) {
            return {
              error: `❌ Próba odbicia **${targetDef.emoji} ${targetDef.name}** zakończyła się niepowodzeniem! (Siła ataku: ${conflictOutcome.attackPower} vs Siła obrony: ${conflictOutcome.defensePower})`,
              cooldown: true
            };
          }
        }
      }

      const territories = store.profiles.territories || {};
      territories.owners = territories.owners || {};
      territories.owners[targetDef.id] = gangId;
      store.profiles.territories = territories;

      return {
        success: true,
        name: targetDef.name,
        emoji: targetDef.emoji,
        cooldown: true,
        conflictOutcome,
        defendingGangId,
        defendingGangName: defendingGang ? defendingGang.name : null,
        defendingGangMembers: defendingGang ? (defendingGang.members || []) : [],
        myGangName: myGang.name
      };
    });

    if (result.error) {
      if (result.cooldown) {
        await message.reply(`💀 ${result.error}\n⏳ Masz **1 godzinę** przerwy przed kolejną próbą.`);
      } else {
        await message.reply(result.error);
      }
      return;
    }

    const powerText = result.conflictOutcome
      ? `\n🪓 Siła ataku: **${result.conflictOutcome.attackPower}** vs 🛡️ Siła obrony: **${result.conflictOutcome.defensePower}**`
      : '';

    await message.reply(`🎉 Pomyślnie odbiłeś terytorium **${result.emoji} ${result.name}**!${powerText}`);

    if (result.defendingGangId && result.defendingGangMembers.length > 0) {
      const activeThreads = Array.from(client.activeThreadIds || []);
      const usersData = loadData('users');
      let bestThread = null;
      let maxCount = 0;
      for (const tId of activeThreads) {
        let count = 0;
        for (const mid of result.defendingGangMembers) {
          const member = usersData[mid];
          if (member && member.lastActiveThreadId === tId) count++;
        }
        if (count > maxCount) {
          maxCount = count;
          bestThread = tId;
        }
      }

      if (bestThread && client.api) {
        const notifyMsg =
          `🚨 **UTRACONO TERYTORIUM!** 🚨\n\n` +
          `Gang **${result.myGangName}** przejął Wasze terytorium **${result.emoji} ${result.name}**!${powerText}\n\n` +
          `💡 Możecie spróbować je odbić: **!terytoria**`;
        try {
          client.api.sendMessage(notifyMsg, bestThread);
        } catch (err) {
          console.error('[TERYTORIA] Błąd wysyłania powiadomienia do poprzedniego właściciela:', err);
        }
      }
    }
  }
};
