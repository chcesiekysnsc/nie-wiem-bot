const config = require('../config/config');
const { formatCurrency, resolveAmount, ensureInventoryRecord, addItem, hasItem, getPassiveMultiplier, getActiveEventMultiplier } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');
const { getEffectiveChance } = require('../utils/chances');

function getGangUser(store, userId) {
  const user = createUser(userId, store.users);
  if (user.gangId && !store.profiles.gangs) store.profiles.gangs = {};
  if (user.gangId && !store.profiles.gangs[user.gangId]) {
    user.gangId = null;
    user.gangRole = null;
  }
  return user;
}
const { getGangBossShopMultiplier, attemptStealBossItem, getItemName, getItemEmoji, getItemDefinition, getAllCrateDefinitions, getCrateDefinition, processBossShopPurchase, ensureDailyLimit, hasGangBossItem, hasGangItem } = require('../utils/gangBossShop');
const { getWeaponMultiplier, getDefenseUpgradeMultiplier, getSpecialGangMultiplier, getMercenaryPowerBonus, getReputationRank, hasReputationBonus } = require('../utils/gangAI');
const { getTerritoryBonus } = require('../utils/territories');
const { getItemSetBonus } = require('../utils/itemSets');
const {
  buildGangArtefaktyCategoryPrompt,
  buildGangArtefaktyCategoryList,
  resolveGangArtefaktyCategory
} = require('../utils/artefactHelpSystem');

const CRATE_ORDER = Object.keys(config.bossShopCrates && config.bossShopCrates.crates ? config.bossShopCrates.crates : {});
const MERCENARIES_PRICE = 2000000;
const MERCENARIES_DURATION_MS = 24 * 60 * 60 * 1000;
const MERCENARIES_SHOP_NUMBER = CRATE_ORDER.length + 1;
const MERCENARY_TYPES = {
  zwykli: { name: 'Zwykli Najemnicy', price: 2000000, attack: 2, defense: 2, intel: 1, desc: '+2 atak, +2 obrona, +1 wywiad' },
  zolnierze: { name: 'Żołnierze', price: 2000000, attack: 5, defense: 0, intel: 0, desc: '+5 ataku' },
  ochroniarze: { name: 'Ochroniarze', price: 2000000, attack: 0, defense: 5, intel: 0, desc: '+5 obrony' },
  szpiedzy: { name: 'Szpiedzy', price: 2000000, attack: 0, defense: 0, intel: 0, desc: '+10% szansy na udany gang skok' },
  elitarni: { name: 'Elitarni Najemnicy', price: 10000000, attack: 5, defense: 5, intel: 2, desc: '+5 atak, +5 obrona, +2 wywiad (wymaga 3000 REP)', minRep: 3000 }
};
const MERCENARY_TYPES_ORDER = ['zwykli', 'zolnierze', 'ochroniarze', 'szpiedzy', 'elitarni'];

function renderBossShopList(ownedIds = []) {
  const crates = getAllCrateDefinitions();
  const crateLines = CRATE_ORDER.map((crateId, idx) => {
    const c = crates[crateId];
    let Y = 0;
    let X = 0;
    if (c.items) {
      const itemIds = Object.keys(c.items);
      Y = itemIds.length;
      X = itemIds.filter(id => ownedIds.includes(id)).length;
    }
    return `${idx + 1}. ${c.emoji} **${c.name}** — ${formatCurrency(c.price)} (posiadacie ${X}/${Y})`;
  });
  const mercenaryLine = `${MERCENARIES_SHOP_NUMBER}. 🪖 **Najemnicy** — od ${formatCurrency(2000000)} (kontrakty 24h)`;
  return [...crateLines, mercenaryLine].join('\n');
}

function notifySupportThreads(client, heist, msg) {
  if (!client.api || !heist || !Array.isArray(heist.supportThreads)) return;
  for (const threadId of heist.supportThreads) {
    if (threadId && threadId !== heist.originThreadId) {
      try {
        client.api.sendMessage(msg, threadId);
      } catch (err) {
        console.error('[GANG SKOK] Błąd powiadomienia grupy wsparcia:', err);
      }
    }
  }
}

module.exports = {
  name: 'gang',
  aliases: ['gangi'],
  async execute(client, message, args) {
    if (!client.gangInvites) {
      client.gangInvites = new Map(); // targetId -> { gangId, inviterId }
    }
    if (!client.gangHeists) {
      client.gangHeists = new Map(); // gangId -> { initiatorId, participants: Set(userIds), endTime }
    }

    const sub = String(args[0] || '').toLowerCase();

    // ==========================================
    // 0. SOJUSZ
    // ==========================================
    if (sub === 'sojusz') {
      const action = String(args[1] || '').toLowerCase();

      const readResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        if (user.gangRole !== 'boss') {
          return { error: '❌ Tylko Boss gangu może zarządzać dyplomacją i sojuszami.' };
        }

        const myGangId = user.gangId;
        const myGang = store.profiles.gangs[myGangId];

        let isBreak = false;
        let queryParam = args.slice(1).join(' ').trim();
        if (action === 'zerwij' || action === 'usun') {
          isBreak = true;
          queryParam = args.slice(2).join(' ').trim();
          if (!queryParam) {
            return { error: '❌ Podaj nazwę gangu lub oznacz gracza z gangu, z którym chcesz zerwać sojusz: **!gang sojusz zerwij <nazwa/oznaczenie>**' };
          }
        }

        let targetGangId = null;
        const mentioned = message.mentions.users.first();
        if (mentioned) {
          const tgtUser = store.users[mentioned.id];
          if (tgtUser && tgtUser.gangId) targetGangId = tgtUser.gangId;
        }
        if (!targetGangId && /^\d{8,}$/.test(queryParam)) {
          const tgtUser = store.users[queryParam];
          if (tgtUser && tgtUser.gangId) targetGangId = tgtUser.gangId;
        }
        if (!targetGangId) {
          const cleanParam = queryParam.toLowerCase();
          if (store.profiles.gangs[cleanParam]) {
            targetGangId = cleanParam;
          } else {
            const foundGang = Object.entries(store.profiles.gangs).find(
              ([id, g]) => g.name.toLowerCase() === cleanParam
            );
            if (foundGang) targetGangId = foundGang[0];
          }
        }

        if (!targetGangId || !store.profiles.gangs[targetGangId]) {
          return { error: `❌ Nie odnaleziono gangu o nazwie/ID/graczu: **${queryParam}**.` };
        }

        if (targetGangId === myGangId) {
          return { error: '❌ Nie możesz zawrzeć sojuszu z własnym gangiem.' };
        }

        const targetGang = store.profiles.gangs[targetGangId];

        return {
          isBreak,
          myGangId,
          targetGangId,
          myGangName: myGang.name,
          targetGangName: targetGang.name,
          targetBossId: targetGang.bossId
        };
      });

      if (readResult.error) {
        await message.reply(readResult.error);
        return;
      }

      const myBossName = await client.resolveUserName(message.author.id);
      const targetBossName = await client.resolveUserName(readResult.targetBossId);

      const writeResult = await withData(store => {
        const myGang = store.profiles.gangs[readResult.myGangId];
        const targetGang = store.profiles.gangs[readResult.targetGangId];

        myGang.alliances = myGang.alliances || [];
        myGang.allianceRequests = myGang.allianceRequests || [];
        targetGang.alliances = targetGang.alliances || [];
        targetGang.allianceRequests = targetGang.allianceRequests || [];

        if (readResult.isBreak) {
          if (!myGang.alliances.includes(readResult.targetGangId)) {
            return { error: `❌ Twój gang nie posiada sojuszu z gangiem **${targetGang.name}**.` };
          }
          myGang.alliances = myGang.alliances.filter(id => id !== readResult.targetGangId);
          targetGang.alliances = targetGang.alliances.filter(id => id !== readResult.myGangId);
          return { action: 'broken' };
        }

        if (myGang.alliances.includes(readResult.targetGangId)) {
          return { error: `❌ Twój gang jest już w sojuszu z gangiem **${targetGang.name}**!` };
        }

        if (myGang.allianceRequests.includes(readResult.targetGangId)) {
          // Accept the alliance!
          myGang.allianceRequests = myGang.allianceRequests.filter(id => id !== readResult.targetGangId);
          targetGang.allianceRequests = targetGang.allianceRequests.filter(id => id !== readResult.myGangId);

          myGang.alliances.push(readResult.targetGangId);
          targetGang.alliances.push(readResult.myGangId);
          return { action: 'accepted' };
        }

        if (targetGang.allianceRequests.includes(readResult.myGangId)) {
          return { error: `⌛ Propozycja sojuszu została już wysłana. Oczekuj na odpowiedź Bossa gangu **${targetGang.name}**.` };
        }

        // Propose new alliance
        targetGang.allianceRequests.push(readResult.myGangId);
        return { action: 'proposed' };
      });

      if (writeResult.error) {
        await message.reply(writeResult.error);
        return;
      }

      const targetBoss = await withData(store => createUser(readResult.targetBossId, store.users));
      const targetThreadId = targetBoss.lastActiveThreadId || message.threadID;

      if (writeResult.action === 'broken') {
        await message.reply(`💔 Zerwałeś sojusz z gangiem **${readResult.targetGangName}**!`);

        const notifyBody = `💔 Boss gangu **${readResult.myGangName}** zerwał sojusz z Twoim gangiem **${readResult.targetGangName}**!`;
        const notifyPayload = {
          body: `${targetBossName}, ${notifyBody}`,
          mentions: [{ tag: targetBossName, id: readResult.targetBossId }]
        };
        client.api.sendMessage(notifyPayload, targetThreadId);
      } else if (writeResult.action === 'accepted') {
        await message.reply(`🤝 Sojusz z gangiem **${readResult.targetGangName}** został zawarty!`);

        if (targetThreadId !== message.threadID) {
          const notifyBody = `🤝 Boss gangu **${readResult.myGangName}** (${myBossName}) zaakceptował Twoją propozycję sojuszu! Gangi **${readResult.myGangName}** oraz **${readResult.targetGangName}** są teraz oficjalnymi sojusznikami.`;
          const notifyPayload = {
            body: `${targetBossName}, ${notifyBody}`,
            mentions: [{ tag: targetBossName, id: readResult.targetBossId }]
          };
          client.api.sendMessage(notifyPayload, targetThreadId);
        }
      } else if (writeResult.action === 'proposed') {
        await message.reply(`⌛ Wysłano propozycję sojuszu do gangu **${readResult.targetGangName}**. Oczekiwanie na akceptację Bossa...`);

        let aiDecision = null;
        try {
          const { handleAllianceProposalToAI } = require('../utils/gangAI');
          aiDecision = await handleAllianceProposalToAI(readResult.targetGangId, readResult.myGangId, config);
        } catch (_) {}

        if (aiDecision && aiDecision.handled) {
          if (aiDecision.accepted) {
            await message.reply(`🤝 Sojusz z gangiem **${readResult.targetGangName}** został zawarty!`);
            if (targetThreadId !== message.threadID) {
              const notifyBody = `🤝 Boss gangu **${readResult.targetGangName}** zaakceptował Twoją propozycję sojuszu! Gangi **${readResult.myGangName}** oraz **${readResult.targetGangName}** są teraz oficjalnymi sojusznikami.`;
              const notifyPayload = {
                body: `${targetBossName}, ${notifyBody}`,
                mentions: [{ tag: targetBossName, id: readResult.targetBossId }]
              };
              client.api.sendMessage(notifyPayload, targetThreadId);
            }
          } else {
            await message.reply(`❌ Gang **${readResult.targetGangName}** odmówił sojuszu.`);
            if (targetThreadId !== message.threadID) {
              const notifyBody = `❌ Boss gangu **${readResult.targetGangName}** odmówił przyjęcia propozycji sojuszu od gangu **${readResult.myGangName}**.`;
              const notifyPayload = {
                body: `${targetBossName}, ${notifyBody}`,
                mentions: [{ tag: targetBossName, id: readResult.targetBossId }]
              };
              client.api.sendMessage(notifyPayload, targetThreadId);
            }
          }
        } else {
          const notifyBody = `🔔 Boss gangu **${readResult.myGangName}** (${myBossName}) chce zawrzeć sojusz z Twoim gangiem **${readResult.targetGangName}**!\n\n💡 Aby zaakceptować propozycję, wpisz na czacie: **!gang sojusz ${readResult.myGangName}**`;
          const notifyPayload = {
            body: `${targetBossName}, ${notifyBody}`,
            mentions: [{ tag: targetBossName, id: readResult.targetBossId }]
          };
          client.api.sendMessage(notifyPayload, targetThreadId);
        }
      }

      return;
    }

    // ==========================================
    // 1. STWORZ
    // ==========================================
    if (sub === 'stworz') {
      const gangName = args.slice(1).join(' ').trim();
      if (!gangName || gangName.length < 3 || gangName.length > 20) {
        await message.reply('❌ Użyj: **!gang stworz <Nazwa>** (od 3 do 20 znaków).');
        return;
      }

      const gangId = gangName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!gangId) {
        await message.reply('❌ Nazwa gangu zawiera niedozwolone znaki.');
        return;
      }

      const result = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};

        // Sprawdź czy gang o tej nazwie już istnieje
        if (store.profiles.gangs[gangId]) {
          return { error: '❌ Gang o takiej nazwie już istnieje.' };
        }

        const user = getGangUser(store, message.author.id);
        if (user.gangId) {
          return { error: '❌ Jesteś już członkiem innego gangu.' };
        }

        const cost = 1000000; // 1mln
        if (user.balance < cost) {
          return { error: `❌ Założenie gangu kosztuje ${formatCurrency(cost)}. Brak wystarczających środków.` };
        }

        user.balance -= cost;
        user.gangId = gangId;
        user.gangRole = 'boss';

        const isCreator = message.author.id === '100060812419294';
        store.profiles.gangs[gangId] = {
          id: gangId,
          name: gangName,
          bossId: message.author.id,
          deputies: [],
          members: [message.author.id],
          vault: 0,
          levelDziupla: 0,
          levelBiznesy: 0,
          levelFach: 0,
          levelUzbrojenie: 0,
          levelObrona: 0,
          mercenaryContracts: [],
          reputation: isCreator ? 3001 : 0,
          lastActivityAt: Date.now(),
          tributePercent: 0,
          lastHeistTime: 0,
          lastAttackTime: 0,
          shieldUntil: 0
        };

        return { success: true, cost };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Pomyślnie założyłeś gang **${gangName}**! Pobrano opłatę **${formatCurrency(result.cost)}**.`);
      return;
    }

    // ==========================================
    // 2. ZAPROS
    // ==========================================
    if (sub === 'zapros') {
      let targetId = null;
      let targetName = '';

      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
        targetName = mentioned.username || `Użytkownik_${targetId.slice(-6)}`;
      } else if (args[1] && /^\d+$/.test(args[1])) {
        targetId = args[1];
        targetName = client.userNames.get(targetId) || `Użytkownik_${targetId.slice(-6)}`;
      }

      if (!targetId) {
        await message.reply('❌ Użyj: **!gang zapros @osoba** lub **!gang zapros <ID>**');
        return;
      }

      if (targetId === message.author.id) {
        await message.reply('❌ Nie możesz zaprosić samego siebie.');
        return;
      }

      const inviteResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';

        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą zapraszać nowych członków.' };
        }

        const maxMembers = 5 + (gang.levelDziupla || 0);
        if (gang.members.length >= maxMembers) {
          return { error: `❌ Twój gang osiągnął maksymalny limit członków (${maxMembers}). Ulepsz Dziuplę.` };
        }

        const targetUser = createUser(targetId, store.users);
        if (targetUser.gangId) {
          return { error: '❌ Zapraszany użytkownik jest już w gangu.' };
        }

        return { success: true, gangName: gang.name, gangId: user.gangId };
      });

      if (inviteResult.error) {
        await message.reply(inviteResult.error);
        return;
      }

      client.gangInvites.set(targetId, {
        gangId: inviteResult.gangId,
        inviterId: message.author.id
      });

      // Auto-kasowanie po 2 minutach
      setTimeout(() => {
        const inv = client.gangInvites.get(targetId);
        if (inv && inv.gangId === inviteResult.gangId && inv.inviterId === message.author.id) {
          client.gangInvites.delete(targetId);
        }
      }, 120000).unref();

      await message.reply(`✉️ Wysłałeś zaproszenie do gangu **${inviteResult.gangName}** dla **${targetName}**! Ważne przez 2 minuty. Zaproszony musi wpisać **!gang dolacz** lub **!gang akceptuj**.`);
      return;
    }

    // ==========================================
    // 3. DOLACZ / AKCEPTUJ
    // ==========================================
    if (sub === 'dolacz' || sub === 'akceptuj') {
      const invite = client.gangInvites.get(message.author.id);
      if (!invite) {
        await message.reply('❌ Nie masz żadnego aktywnego zaproszenia do gangu.');
        return;
      }

      const joinResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const gang = store.profiles.gangs[invite.gangId];

        if (!gang) {
          client.gangInvites.delete(message.author.id);
          return { error: '❌ Ten gang już nie istnieje.' };
        }

        const user = getGangUser(store, message.author.id);
        if (user.gangId) {
          client.gangInvites.delete(message.author.id);
          return { error: '❌ Jesteś już w gangu.' };
        }

        const maxMembers = 5 + (gang.levelDziupla || 0);
        if (gang.members.length >= maxMembers) {
          return { error: `❌ Gang jest pełny (maksymalny limit: ${maxMembers} członków).` };
        }

        // Dodaj do gangu
        gang.members.push(message.author.id);
        user.gangId = invite.gangId;
        user.gangRole = 'member';

        client.gangInvites.delete(message.author.id);
        return { success: true, gangName: gang.name };
      });

      if (joinResult.error) {
        await message.reply(joinResult.error);
        return;
      }

      await message.reply(`🎉 Pomyślnie dołączyłeś do gangu **${joinResult.gangName}**! Witamy w ekipie.`);
      return;
    }

    // ==========================================
    // 4. AWANS
    // ==========================================
    if (sub === 'awans') {
      let targetId = null;
      let targetName = '';

      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
        targetName = mentioned.username || `Użytkownik_${targetId.slice(-6)}`;
      } else if (args[1] && /^\d+$/.test(args[1])) {
        targetId = args[1];
        targetName = client.userNames.get(targetId) || `Użytkownik_${targetId.slice(-6)}`;
      }

      if (!targetId) {
        await message.reply('❌ Użyj: **!gang awans @osoba** lub **!gang awans <ID>** (może użyć też skrótu **!awans @osoba**).');
        return;
      }

      const promoteResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];
        if (user.gangRole !== 'boss') {
          return { error: '❌ Tylko Boss gangu może awansować na Zastępcę.' };
        }

        if (!gang.members.includes(targetId)) {
          return { error: '❌ Ten użytkownik nie należy do Twojego gangu.' };
        }

        const targetUser = createUser(targetId, store.users);
        if (targetUser.gangRole === 'boss') {
          return { error: '❌ Nie możesz awansować samego siebie lub innego Bossa.' };
        }

        if (targetUser.gangRole === 'deputy') {
          return { error: '❌ Ten użytkownik jest już Zastępcą.' };
        }

        // Awansuj
        targetUser.gangRole = 'deputy';
        if (!gang.deputies.includes(targetId)) {
          gang.deputies.push(targetId);
        }

        return { success: true, gangName: gang.name };
      });

      if (promoteResult.error) {
        await message.reply(promoteResult.error);
        return;
      }

      await message.reply(`🎖️ Awansowałeś **${targetName}** na stanowisko **Zastępcy** w gangu **${promoteResult.gangName}**!`);
      return;
    }

    // ==========================================
    // 5. WYRZUC (obsługuje @mention, ID lub numer z listy !gang info)
    // ==========================================
    if (sub === 'wyrzuc') {
      let targetId = null;
      let targetName = '';
      let useNumberIndex = false;
      let memberIndex = null;

      const mentioned = message.mentions.users.first();
      if (mentioned) {
        targetId = mentioned.id;
        targetName = mentioned.username || `Użytkownik_${targetId.slice(-6)}`;
      } else if (args[1]) {
        const raw = args[1];
        const num = Number(raw);
        // Jeśli to liczba 1-999, traktuj jako numer z listy !gang info
        if (Number.isInteger(num) && num >= 1 && num <= 999 && raw.length <= 3) {
          useNumberIndex = true;
          memberIndex = num;
        } else if (/^\d+$/.test(raw) && raw.length >= 8) {
          // Traktuj jako ID użytkownika
          targetId = raw;
          targetName = client.userNames.get(targetId) || `Użytkownik_${String(targetId).slice(-6)}`;
        }
      }

      if (!targetId && !useNumberIndex) {
        await message.reply('❌ Użyj: **!gang wyrzuc @osoba**, **!gang wyrzuc <ID>** lub **!gang wyrzuc <nr>** (numer z listy !gang info).');
        return;
      }

      const kickResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';

        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą wyrzucać członków.' };
        }

        // Jeśli użyto numeru z listy, rozwiąż do ID
        if (useNumberIndex) {
          const deputies = [...(gang.deputies || [])].sort((a, b) => (gang.deposits?.[b] || 0) - (gang.deposits?.[a] || 0));
          const regularMembers = (gang.members || []).filter(
            id => id !== gang.bossId && !deputies.includes(id)
          ).sort((a, b) => (gang.deposits?.[b] || 0) - (gang.deposits?.[a] || 0));

          const orderedMembers = [
            gang.bossId,
            ...deputies,
            ...regularMembers
          ].filter(id => (gang.members || []).includes(id) || id === gang.bossId);

          const targetIdx = memberIndex - 1;
          if (targetIdx < 0 || targetIdx >= orderedMembers.length) {
            return { error: `❌ Nie znaleziono członka o numerze **${memberIndex}**. Sprawdź listę w **!gang info**.` };
          }

          targetId = orderedMembers[targetIdx];
          targetName = client.userNames.get(targetId) || `Użytkownik_${String(targetId).slice(-6)}`;
        }

        if (!gang.members.includes(targetId)) {
          return { error: '❌ Ten użytkownik nie należy do Twojego gangu.' };
        }

        const targetUser = createUser(targetId, store.users);

        // Zastępca nie może wyrzucić Bossa ani innego Zastępcy
        if (isDeputy && (targetUser.gangRole === 'boss' || targetUser.gangRole === 'deputy')) {
          return { error: '❌ Zastępca może wyrzucać wyłącznie zwykłych członków gangu.' };
        }

        // Usuń członka
        gang.members = gang.members.filter(id => id !== targetId);
        gang.deputies = gang.deputies.filter(id => id !== targetId);
        targetUser.gangId = null;
        targetUser.gangRole = null;

        return { success: true, gangName: gang.name };
      });

      if (kickResult.error) {
        await message.reply(kickResult.error);
        return;
      }

      await message.reply(`👞 Wyrzucono **${kickResult.targetName || targetName}** z gangu **${kickResult.gangName}**.`);
      return;
    }

    // ==========================================
    // 5b. USUN (wyrzuc po numerze z listy !gang info)
    // ==========================================
    if (sub === 'usun') {
      const rawNr = args[1];
      const memberIndex = Number(rawNr);

      if (!rawNr || !Number.isInteger(memberIndex) || memberIndex < 1) {
        await message.reply('❌ Użyj: **!gang usun <nr>** — numer członka z listy w **!gang info**.');
        return;
      }

      const kickResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';

        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą usuwać członków.' };
        }

        const deputies = [...(gang.deputies || [])].sort((a, b) => (gang.deposits?.[b] || 0) - (gang.deposits?.[a] || 0));
        const regularMembers = (gang.members || []).filter(
          id => id !== gang.bossId && !deputies.includes(id)
        ).sort((a, b) => (gang.deposits?.[b] || 0) - (gang.deposits?.[a] || 0));

        const orderedMembers = [
          gang.bossId,
          ...deputies,
          ...regularMembers
        ].filter(id => (gang.members || []).includes(id) || id === gang.bossId);

        const targetIdx = memberIndex - 1;
        if (targetIdx < 0 || targetIdx >= orderedMembers.length) {
          return { error: `❌ Nie znaleziono członka o numerze **${memberIndex}**. Sprawdź listę w **!gang info**.` };
        }

        const targetId = orderedMembers[targetIdx];
        const targetUser = createUser(targetId, store.users);

        if (targetId === message.author.id) {
          return { error: '❌ Nie możesz usunąć samego siebie. Jeśli chcesz odejść, użyj **!gang opusc**.' };
        }

        if (isDeputy && (targetUser.gangRole === 'boss' || targetUser.gangRole === 'deputy')) {
          return { error: '❌ Zastępca może usuwać wyłącznie zwykłych członków gangu.' };
        }

        gang.members = gang.members.filter(id => id !== targetId);
        gang.deputies = gang.deputies.filter(id => id !== targetId);
        targetUser.gangId = null;
        targetUser.gangRole = null;

        const targetName = client.userNames.get(targetId) || `Użytkownik_${String(targetId).slice(-6)}`;
        return { success: true, gangName: gang.name, targetName };
      });

      if (kickResult.error) {
        await message.reply(kickResult.error);
        return;
      }

      await message.reply(`👞 Usunięto **${kickResult.targetName}** z gangu **${kickResult.gangName}**.`);
      return;
    }

    // ==========================================
    // 6. OPUSC
    // ==========================================
    if (sub === 'opusc') {
      const leaveResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];

        if (user.gangRole === 'boss') {
          // Jeśli jest jedynym członkiem, kasujemy gang
          if (gang.members.length === 1) {
            delete store.profiles.gangs[user.gangId];
            user.gangId = null;
            user.gangRole = null;
            return { success: true, deleted: true, gangName: gang.name };
          } else {
            return { error: '❌ Jako Boss nie możesz opuścić gangu, gdy są w nim inni członkowie. Przekaż przywództwo awansując kogoś innego na Bossa (lub usuń wszystkich członków).' };
          }
        }

        // Jeśli to zwykły członek lub zastępca
        gang.members = gang.members.filter(id => id !== message.author.id);
        gang.deputies = gang.deputies.filter(id => id !== message.author.id);
        user.gangId = null;
        user.gangRole = null;

        return { success: true, deleted: false, gangName: gang.name };
      });

      if (leaveResult.error) {
        await message.reply(leaveResult.error);
        return;
      }

      if (leaveResult.deleted) {
        await message.reply(`🚪 Opuściłeś gang **${leaveResult.gangName}**. Ponieważ byłeś jedynym członkiem, gang został rozwiązany.`);
      } else {
        await message.reply(`🚪 Opuściłeś gang **${leaveResult.gangName}**.`);
      }
      return;
    }

    // ==========================================
    // 7. WPLAC
    // ==========================================
    if (sub === 'wplac') {
      const amountRaw = args[1];
      if (!amountRaw) {
        await message.reply('❌ Użyj: **!gang wplac <kwota/all>**');
        return;
      }

      const depositResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const amount = resolveAmount(amountRaw, user.balance);
        if (amount === null || amount <= 0) {
          return { error: '❌ Podaj poprawną kwotę wpłaty.' };
        }

        let lockedAmount = 0;
        if (user.activeLoan) {
          lockedAmount = user.activeLoan.originalAmount;
        }

        if (lockedAmount > 0 && user.balance - lockedAmount < amount) {
          return { error: `❌ Te środki są zablokowane z tytułu pożyczki. Wolne środki do wpłaty: ${formatCurrency(Math.max(0, user.balance - lockedAmount))}` };
        }

        if (user.balance < amount) {
          return { error: '❌ Nie masz tylu monet w portfelu.' };
        }

        user.balance -= amount;
        const gangObj = store.profiles.gangs[user.gangId];
        const { getTerritoryBonus } = require('../utils/territories');
        const bankDepositBonus = getTerritoryBonus(gangObj.id, 'bank_deposit');
        const finalAmount = Math.floor(amount * (1 + bankDepositBonus));
        gangObj.vault += finalAmount;
        gangObj.deposits = gangObj.deposits || {};
        gangObj.deposits[message.author.id] = (gangObj.deposits[message.author.id] || 0) + finalAmount;
        gangObj.lastActivityAt = Date.now();

        return { success: true, amount, gangName: gangObj.name };
      });

      if (depositResult.error) {
        await message.reply(depositResult.error);
        return;
      }

      await message.reply(`📥 Wpłaciłeś **${formatCurrency(depositResult.amount)}** do sejfu gangu **${depositResult.gangName}**.`);
      return;
    }

    // ==========================================
    // 8. WYPLAC
    // ==========================================
    if (sub === 'wyplac') {
      const amountRaw = args[1];
      if (!amountRaw) {
        await message.reply('❌ Użyj: **!gang wyplac <kwota/all>**');
        return;
      }

      const withdrawResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const myGangId = user.gangId;
        if (client.activeGangWars) {
          if (client.activeGangWars.has(myGangId)) {
            return { error: '❌ Nie można wypłacać pieniędzy z sejfu podczas wojny gangów!' };
          }
          for (const war of client.activeGangWars.values()) {
            if (war.defenderGangId === myGangId) {
              return { error: '❌ Nie można wypłacać pieniędzy z sejfu podczas wojny gangów!' };
            }
          }
        }

        const gang = store.profiles.gangs[user.gangId];

        if (user.gangRole !== 'boss') {
          return { error: '❌ Tylko Boss gangu może wypłacać monety z sejfu.' };
        }

        const amount = resolveAmount(amountRaw, gang.vault);
        if (amount === null || amount <= 0) {
          return { error: '❌ Podaj poprawną kwotę wypłaty.' };
        }

        if (gang.vault < amount) {
          return { error: '❌ Sejf gangu nie posiada takiej kwoty.' };
        }

        const tax = Math.floor(amount * 0.20);
        const netAmount = amount - tax;

        gang.vault -= amount;
        user.balance += netAmount;
        gang.lastActivityAt = Date.now();

        return { success: true, amount, netAmount, tax, gangName: gang.name };
      });

      if (withdrawResult.error) {
        await message.reply(withdrawResult.error);
        return;
      }

      await message.reply(
        `📤 Wypłata z sejfu gangu **${withdrawResult.gangName}**:\n` +
        `💰 Kwota brutto: **${formatCurrency(withdrawResult.amount)}**\n` +
        `🏛️ Podatek (20%): **-${formatCurrency(withdrawResult.tax)}**\n` +
        `✅ Otrzymujesz: **${formatCurrency(withdrawResult.netAmount)}**`
      );
      return;
    }

    // ==========================================
    // 8.5. HARACZ
    // ==========================================
    if (sub === 'haracz') {
      const valRaw = args[1];

      const tributeResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];

        if (user.gangRole !== 'boss') {
          return { error: '❌ Tylko Boss gangu może zarządzać haraczem.' };
        }

        if (valRaw === undefined || valRaw === '') {
          const currentTribute = gang.tributePercent !== undefined ? gang.tributePercent : 0;
          return { showCurrent: true, currentTribute };
        }

        const cleanVal = valRaw.replace('%', '');
        if (!/^\d+$/.test(cleanVal)) {
          return { error: '❌ Podaj poprawną wartość procentową od 0 do 100.' };
        }

        const percent = parseInt(cleanVal, 10);
        if (isNaN(percent) || percent < 0 || percent > 100) {
          return { error: '❌ Podaj poprawną wartość procentową od 0 do 100.' };
        }

        gang.tributePercent = percent;
        return { success: true, percent, gangName: gang.name };
      });

      if (tributeResult.error) {
        await message.reply(tributeResult.error);
        return;
      }

      if (tributeResult.showCurrent) {
        await message.reply(`💰 Aktualny haracz w Twoim gangu wynosi **${tributeResult.currentTribute}%**.`);
        return;
      }

      await message.reply(`💰 Pomyślnie ustawiono haracz dla gangu **${tributeResult.gangName}** na **${tributeResult.percent}%**!\nTyle będzie trafiać do Twojego portfela z kradzieży zwykłych członków.`);
      return;
    }

    // ==========================================
    // 9. ULEPSZ
    // ==========================================
    if (sub === 'ulepsz') {
      let targetUpgrade = String(args[1] || '').toLowerCase();
      if (targetUpgrade === '1') targetUpgrade = 'dziupla';
      else if (targetUpgrade === '2') targetUpgrade = 'biznesy';
      else if (targetUpgrade === '3') targetUpgrade = 'fach';
      else if (targetUpgrade === '4') targetUpgrade = 'uzbrojenie';
      else if (targetUpgrade === '5') targetUpgrade = 'obrona';

      if (!['dziupla', 'biznesy', 'fach', 'uzbrojenie', 'obrona'].includes(targetUpgrade)) {
        const levels = await withData(store => {
          const user = getGangUser(store, message.author.id);
          if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
            const gang = store.profiles.gangs[user.gangId];
            return {
              levelDziupla: gang.levelDziupla || 0,
              levelBiznesy: gang.levelBiznesy || 0,
              levelFach: gang.levelFach || 0,
              levelUzbrojenie: gang.levelUzbrojenie || 0,
              levelObrona: gang.levelObrona || 0
            };
          }
          return null;
        });

        let costsMsg = '';
        if (levels) {
          const costDziupla = levels.levelDziupla < 10 ? formatCurrency(100000 + levels.levelDziupla * 40000) : 'Maksymalny poziom';
          const costBiznesy = levels.levelBiznesy < 3 ? formatCurrency([200000, 400000, 650000][levels.levelBiznesy]) : 'Maksymalny poziom';
          const costFach = levels.levelFach < 3 ? formatCurrency([200000, 350000, 600000][levels.levelFach]) : 'Maksymalny poziom';
          const costUzbrojenie = levels.levelUzbrojenie < 5 ? formatCurrency([500000, 1000000, 2000000, 4000000, 8000000][levels.levelUzbrojenie]) : 'Maksymalny poziom';
          const costObrona = levels.levelObrona < 5 ? formatCurrency([500000, 1000000, 2000000, 4000000, 8000000][levels.levelObrona]) : 'Maksymalny poziom';

          costsMsg = `\n\n🛠️ **Koszt kolejnych ulepszeń dla Twojego gangu:**\n` +
                     `• 📦 **Dziupla** (Lvl ${levels.levelDziupla} -> ${levels.levelDziupla + 1}): **${costDziupla}**\n` +
                     `• 📈 **Legalne Biznesy** (Lvl ${levels.levelBiznesy} -> ${levels.levelBiznesy + 1}): **${costBiznesy}**\n` +
                     `• 🥷 **Złodziejski Fach** (Lvl ${levels.levelFach} -> ${levels.levelFach + 1}): **${costFach}**\n` +
                     `• ⚔️ **Lepsze uzbrojenie** (Lvl ${levels.levelUzbrojenie} -> ${levels.levelUzbrojenie + 1}): **${costUzbrojenie}**\n` +
                     `• 🛡️ **Lepsza strategia obronna** (Lvl ${levels.levelObrona} -> ${levels.levelObrona + 1}): **${costObrona}**`;
        } else {
          costsMsg = `\n\n🛠️ **Cennik ulepszeń gangów:**\n` +
                     `• 📦 **Dziupla**: **100 000 💰** (każdy kolejny poziom +40 000 💰)\n` +
                     `• 📈 **Legalne Biznesy**: Lvl 1: **200 000 💰** | Lvl 2: **400 000 💰** | Lvl 3: **650 000 💰**\n` +
                     `• 🥷 **Złodziejski Fach**: Lvl 1: **200 000 💰** | Lvl 2: **350 000 💰** | Lvl 3: **600 000 💰**\n` +
                     `• ⚔️ **Lepsze uzbrojenie**: Lvl 1: **500 000 💰** | Lvl 2: **1 000 000 💰** | Lvl 3: **2 000 000 💰** | Lvl 4: **4 000 000 💰** | Lvl 5: **8 000 000 💰**\n` +
                     `• 🛡️ **Lepsza strategia obronna**: Lvl 1: **500 000 💰** | Lvl 2: **1 000 000 💰** | Lvl 3: **2 000 000 💰** | Lvl 4: **4 000 000 💰** | Lvl 5: **8 000 000 💰**`;
        }

        await message.reply(`❌ Użyj: **!gang ulepsz <dziupla/biznesy/fach/uzbrojenie/obrona>** lub **!gang ulepsz <1/2/3/4/5>**${costsMsg}`);
        return;
      }

      const upgradeResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const myGangId = user.gangId;
        if (client.activeGangWars) {
          if (client.activeGangWars.has(myGangId)) {
            return { error: '❌ Nie można ulepszać gangu podczas wojny gangów!' };
          }
          for (const war of client.activeGangWars.values()) {
            if (war.defenderGangId === myGangId) {
              return { error: '❌ Nie można ulepszać gangu podczas wojny gangów!' };
            }
          }
        }

        const gang = store.profiles.gangs[user.gangId];
        if (user.gangRole !== 'boss') {
          return { error: '❌ Tylko Boss gangu może zarządzać ulepszeniami.' };
        }

        let cost = 0;
        let newLevel = 0;
        let upgradeLabel = '';

        if (targetUpgrade === 'dziupla') {
          const currentLevel = gang.levelDziupla || 0;
          if (currentLevel >= 10) {
            return { error: '❌ Dziupla jest już ulepszona na maksymalny poziom (10).' };
          }
          cost = 100000 + currentLevel * 40000;
          newLevel = currentLevel + 1;
          upgradeLabel = `Dziupla (Maks. członkowie: ${5 + newLevel})`;
        } else if (targetUpgrade === 'biznesy') {
          const currentLevel = gang.levelBiznesy || 0;
          if (currentLevel >= 3) {
            return { error: '❌ Legalne Biznesy są już na maksymalnym poziomie (3).' };
          }
          const costs = [200000, 400000, 650000];
          cost = costs[currentLevel];
          newLevel = currentLevel + 1;
          const bonuses = ['+10%', '+20%', '+30%'];
          upgradeLabel = `Legalne Biznesy (Praca bonus: ${bonuses[currentLevel]})`;
        } else if (targetUpgrade === 'fach') {
          const currentLevel = gang.levelFach || 0;
          if (currentLevel >= 3) {
            return { error: '❌ Złodziejski Fach jest już na maksymalnym poziomie (3).' };
          }
          const costs = [200000, 350000, 600000];
          cost = costs[currentLevel];
          newLevel = currentLevel + 1;
          const bonuses = ['+4%', '+8%', '+12%'];
          upgradeLabel = `Złodziejski Fach (Kradzieże bonus: ${bonuses[currentLevel]})`;
        } else if (targetUpgrade === 'uzbrojenie') {
          const currentLevel = gang.levelUzbrojenie || 0;
          if (currentLevel >= 5) {
            return { error: '❌ Lepsze uzbrojenie jest już na maksymalnym poziomie (5).' };
          }
          const costs = [500000, 1000000, 2000000, 4000000, 8000000];
          cost = costs[currentLevel];
          newLevel = currentLevel + 1;
          const bonuses = ['+4%', '+8%', '+12%', '+16%', '+24%'];
          upgradeLabel = `Lepsze uzbrojenie (Atak gangu bonus: ${bonuses[currentLevel]})`;
        } else if (targetUpgrade === 'obrona') {
          const currentLevel = gang.levelObrona || 0;
          if (currentLevel >= 5) {
            return { error: '❌ Lepsza strategia obronna jest już na maksymalnym poziomie (5).' };
          }
          const costs = [500000, 1000000, 2000000, 4000000, 8000000];
          cost = costs[currentLevel];
          newLevel = currentLevel + 1;
          const bonuses = ['+4%', '+8%', '+12%', '+16%', '+24%'];
          upgradeLabel = `Lepsza strategia obronna (Obrona gangu bonus: ${bonuses[currentLevel]})`;
        }

        if (hasGangBossItem(gang, 'warsztat_gang')) {
          cost = Math.floor(cost * 0.95);
        }
        const { getTerritoryBonus } = require('../utils/territories');
        const upgradeCostBonus = getTerritoryBonus(gang.id, 'upgrade_cost');
        if (upgradeCostBonus < 0) {
          cost = Math.floor(cost * (1 + upgradeCostBonus));
        }

        if (gang.vault < cost) {
          return { error: `❌ Ulepszenie kosztuje ${formatCurrency(cost)} z sejfu gangu. Posiadacie: ${formatCurrency(gang.vault)}.` };
        }

        gang.vault -= cost;
        if (targetUpgrade === 'dziupla') gang.levelDziupla = newLevel;
        else if (targetUpgrade === 'biznesy') gang.levelBiznesy = newLevel;
        else if (targetUpgrade === 'fach') gang.levelFach = newLevel;
        else if (targetUpgrade === 'uzbrojenie') gang.levelUzbrojenie = newLevel;
        else if (targetUpgrade === 'obrona') gang.levelObrona = newLevel;
        gang.lastActivityAt = Date.now();

        return { success: true, cost, upgradeLabel, newLevel, gangName: gang.name };
      });

      if (upgradeResult.error) {
        await message.reply(upgradeResult.error);
        return;
      }

      await message.reply(`🛠️ Pomyślnie kupiono ulepszenie dla gangu **${upgradeResult.gangName}**:\n📌 **${upgradeResult.upgradeLabel}** za **${formatCurrency(upgradeResult.cost)}** (z sejfu gangu).`);
      return;
    }

    // ==========================================
    // 9. WSPARCIE (wsparcie sojuszników w skoku)
    // ==========================================
    if (sub === 'wsparcie') {
      const targetParam = args.slice(1).join(' ').trim();
      if (!targetParam) {
        await message.reply('❌ Podaj nazwę gangu sojuszniczego lub oznacz jego członka: **!gang wsparcie <nazwa/oznaczenie>**');
        return;
      }

      const supportResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const myGang = store.profiles.gangs[user.gangId];
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';

        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą prosić o wsparcie.' };
        }

        // Sprawdź czy jest aktywny skok
        const activeHeist = client.gangHeists.get(user.gangId);
        if (!activeHeist) {
          return { error: '❌ Twój gang nie prowadzi obecnie przygotowań do skoku. Najpierw wpisz **!gang skok**.' };
        }

        // Znajdź sojuszniczy gang
        let targetGangId = null;
        const mentioned = message.mentions.users.first();
        if (mentioned) {
          const tgtUser = store.users[mentioned.id];
          if (tgtUser && tgtUser.gangId) targetGangId = tgtUser.gangId;
        }
        if (!targetGangId && /^\d{8,}$/.test(targetParam)) {
          const tgtUser = store.users[targetParam];
          if (tgtUser && tgtUser.gangId) targetGangId = tgtUser.gangId;
        }
        if (!targetGangId) {
          const cleanParam = targetParam.toLowerCase();
          if (store.profiles.gangs[cleanParam]) {
            targetGangId = cleanParam;
          } else {
            const foundGang = Object.entries(store.profiles.gangs).find(
              ([id, g]) => g.name.toLowerCase() === cleanParam
            );
            if (foundGang) targetGangId = foundGang[0];
          }
        }

        if (!targetGangId || !store.profiles.gangs[targetGangId]) {
          return { error: `❌ Nie odnaleziono gangu o nazwie/ID/graczu: **${targetParam}**.` };
        }

        if (targetGangId === user.gangId) {
          return { error: '❌ Nie możesz poprosić o wsparcie własny gang.' };
        }

        // Sprawdź czy to sojusz
        const myGangAlliances = myGang.alliances || [];
        if (!myGangAlliances.includes(targetGangId)) {
          return { error: `❌ Gang **${store.profiles.gangs[targetGangId].name}** nie jest twoim sojusznikiem.` };
        }

        // Sprawdź limit 1h dla sojuszniczego gangu
        const targetGang = store.profiles.gangs[targetGangId];
        const now = Date.now();
        if (targetGang.lastSupportTime && now - targetGang.lastSupportTime < 60 * 60 * 1000) {
          const leftSec = Math.ceil((60 * 60 * 1000 - (now - targetGang.lastSupportTime)) / 1000);
          const mins = Math.floor(leftSec / 60);
          const secs = leftSec % 60;
          const leftStr = mins ? `${mins}m ${secs}s` : `${secs}s`;
          return { error: `❌ Gang **${targetGang.name}** może pomagać innym gangom w skokach raz na godzinę. Może pomóc za: **${leftStr}**.` };
        }

        // Znajdź grupę z największą liczbą członków sojuszniczego gangu
        const targetMembers = targetGang.members || [];
        const activeThreads = Array.from(client.activeThreadIds || []);

        let bestThread = null;
        let maxMemberCount = 0;

        for (const threadId of activeThreads) {
          const memberCount = targetMembers.filter(memberId => {
            const member = store.users[memberId];
            if (!member) return false;
            return member.lastActiveThreadId === threadId;
          }).length;

          if (memberCount > maxMemberCount) {
            maxMemberCount = memberCount;
            bestThread = threadId;
          }
        }

        return {
          success: true,
          myGangId: user.gangId,
          myGangName: myGang.name,
          targetGangName: targetGang.name,
          targetGangId: targetGangId,
          targetMembers: targetMembers,
          bestThread: bestThread,
          maxMemberCount: maxMemberCount,
          participantsCount: activeHeist.participants.size
        };
      });

      if (supportResult.error) {
        await message.reply(supportResult.error);
        return;
      }

      if (!supportResult.bestThread) {
        await message.reply(`❌ Nie znaleziono aktywnej grupy z członkami gangu **${supportResult.targetGangName}**.`);
        return;
      }

      // Dodaj informację o wsparciu do aktywnego skoku
      const heist = client.gangHeists.get(supportResult.myGangId);
      if (heist) {
        heist.supportedGangs = heist.supportedGangs || [];
        if (!heist.supportedGangs.includes(supportResult.targetGangId)) {
          heist.supportedGangs.push(supportResult.targetGangId);
        }
        heist.supportThreads = heist.supportThreads || [];
        if (supportResult.bestThread && !heist.supportThreads.includes(supportResult.bestThread)) {
          heist.supportThreads.push(supportResult.bestThread);
        }
      }

      // Nie ustawiamy lastSupportTime tutaj - tylko gdy ktoś faktycznie dołączy do skoku

      // Wyślij powiadomienie do grupy sojuszniczego gangu
      try {
        // Pobierz nazwy członków sojuszniczego gangu do oznaczenia
        const validMentions = [];
        for (const memberId of supportResult.targetMembers) {
          try {
            const memberName = await client.resolveUserName(memberId);
            validMentions.push({ tag: `@${memberName}`, id: memberId });
          } catch {}
        }

        const mentionLine = validMentions.map(m => m.tag).join(' ');

        const notifyMsg = `🤝 **WSPIERANIE SKOKU GANGU** 🤝\n\n` +
          `Gang **${supportResult.myGangName}** prosi o wsparcie w skoku!\n` +
          `📊 Obecnie zapisanych uczestników: **${supportResult.participantsCount}**\n\n` +
          `👥 Członkowie gangu **${supportResult.targetGangName}** mogą wesprzeć skok wpisem:\n` +
          `**!gang wesprzyj**\n\n` +
          (mentionLine ? `${mentionLine}\n\n` : '') +
          `⚠️ *Wymagane minimum 100 komend. Więcej uczestników = większy łup!*`;

        client.api.sendMessage({
          body: notifyMsg,
          mentions: validMentions
        }, supportResult.bestThread);
        await message.reply(`✅ Wysłano prośbę o wsparcie do gangu **${supportResult.targetGangName}**! Powiadomienie wysłano na grupę z **${supportResult.maxMemberCount}** członkami tego gangu (oznaczono ${validMentions.length} osób).`);
      } catch (err) {
        console.error('[GANG WSPIERANIE] Błąd wysyłania powiadomienia:', err);
        await message.reply(`⚠️ Wysłano prośbę o wsparcie, ale wystąpił błąd podczas wysyłania powiadomienia do gangu **${supportResult.targetGangName}**.`);
      }
      return;
    }

    // ==========================================
    // 9b. WESPRZYJ (dołączenie do skoku sojusznika)
    // ==========================================
    if (sub === 'wesprzyj') {
      const joinRes = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (user.jailUntil && user.jailUntil > Date.now()) {
          return { error: '❌ Jesteś w więzieniu i nie możesz brać udziału w skokach!' };
        }

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        if (user.commandsUsed < 100) {
          return { error: '❌ Musisz mieć użyte minimum 100 komend, aby wesprzeć skok gangu.' };
        }

        const myGang = store.profiles.gangs[user.gangId];
        const alliances = myGang.alliances || [];

        let activeHeist = null;
        let heistGangName = null;
        for (const allianceGangId of alliances) {
          const allianceHeist = client.gangHeists.get(allianceGangId);
          if (allianceHeist && allianceHeist.supportedGangs && allianceHeist.supportedGangs.includes(user.gangId)) {
            activeHeist = allianceHeist;
            heistGangName = store.profiles.gangs[allianceGangId].name;
            break;
          }
        }

        if (!activeHeist) {
          return { error: '❌ Żaden sojuszniczy gang nie prosi obecnie o wsparcie w skoku.' };
        }

        return { userGangId: user.gangId, activeHeist, heistGangName };
      });

      if (joinRes.error) {
        await message.reply(joinRes.error);
        return;
      }

      const { activeHeist, heistGangName, userGangId } = joinRes;

      if (activeHeist.participants.has(message.author.id)) {
        await message.reply('❌ Już bierzesz udział w tym skoku.');
        return;
      }

      activeHeist.participants.add(message.author.id);

      await withData(store => {
        if (store.profiles.gangs[userGangId]) {
          store.profiles.gangs[userGangId].lastSupportTime = Date.now();
        }
      });

      await message.reply(`🚗 Dołączyłeś do skoku jako wsparcie dla gangu **${heistGangName}**! Obecnie zapisanych graczy: **${activeHeist.participants.size}**.`);
      return;
    }

    // ==========================================
    // 10. SKOK / SKOK DOLACZ
    // ==========================================
    if (sub === 'skok') {
      const option = String(args[1] || '').toLowerCase();

      // DOLACZENIE DO AKTYWNEGO SKOKU
      if (option === 'dolacz' || option === 'd') {
        const getJoinRes = await withData(store => {
          store.profiles.gangs = store.profiles.gangs || {};
          const user = getGangUser(store, message.author.id);

          if (user.jailUntil && user.jailUntil > Date.now()) {
            return { error: '❌ Jesteś w więzieniu i nie możesz brać udziału w skokach!' };
          }

          if (!user.gangId || !store.profiles.gangs[user.gangId]) {
            return { error: '❌ Nie należysz do żadnego gangu.' };
          }

          if (user.commandsUsed < 100) {
            return { error: '❌ Musisz mieć użyte minimum 100 komend, aby dołączyć do skoku gangu.' };
          }

          // Sprawdź czy własny gang ma aktywny skok
          const activeHeist = client.gangHeists.get(user.gangId);

          return {
            activeHeist,
            error: !activeHeist ? '❌ Twój gang nie prowadzi obecnie przygotowań do skoku. Boss lub Zastępca musi wpisać **!gang skok**. Jeśli chcesz wesprzeć skok sojuszniczego gangu, wpisz **!gang wesprzyj**.' : null
          };
        });

        if (getJoinRes.error) {
          await message.reply(getJoinRes.error);
          return;
        }

        const activeHeist = getJoinRes.activeHeist;

        if (activeHeist.participants.has(message.author.id)) {
          await message.reply('❌ Już bierzesz udział w tym skoku.');
          return;
        }

        activeHeist.participants.add(message.author.id);

        await message.reply(`🚗 Dołączyłeś do przygotowań! Obecnie zapisanych graczy: **${activeHeist.participants.size}**.`);
        return;
      }

      // INICJACJA SKOKU
      const gangHeistSuccessOverride = await getEffectiveChance(message.author.id, 'gang_heist_success');

      const startResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);
        const inventory = ensureInventoryRecord(store.inventory, message.author.id);

        if (user.jailUntil && user.jailUntil > Date.now()) {
          return { error: '❌ Jesteś w więzieniu i nie możesz zaplanować skoku gangu!' };
        }

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        if (user.commandsUsed < 100) {
          return { error: '❌ Musisz mieć użyte minimum 100 komend, aby zaplanować skok gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';

        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą zaplanować skok gangu.' };
        }

        if ((gang.vault || 0) < 500000) {
          return { error: `❌ Sejf gangu musi mieć minimum **500 000 v**, aby zaplanować skok. Obecnie: **${(gang.vault || 0).toLocaleString()} v**.` };
        }

        // Sprawdź cooldown 1h
        const lastTime = gang.lastHeistTime || 0;
        const now = Date.now();
        let heistCooldownMs = 3600000;
        const evMul = getActiveEventMultiplier('cooldowns');
        if (evMul && evMul > 1) {
          heistCooldownMs = Math.floor(heistCooldownMs / evMul);
        }
        const heistCdBonus = getGangBossShopMultiplier(gang, 'cooldown');
        if (heistCdBonus > 0) {
          heistCooldownMs = Math.floor(heistCooldownMs * (1 - heistCdBonus));
        }
        const { getGlobalCooldownReduction } = require('../utils/economy');
        const heistGlobalCdReduction = getGlobalCooldownReduction(inventory);
        if (heistGlobalCdReduction > 0) {
          heistCooldownMs = Math.floor(heistCooldownMs * (1 - heistGlobalCdReduction));
        }
        if (now - lastTime < heistCooldownMs) {
          const diffSec = Math.ceil((heistCooldownMs - (now - lastTime)) / 1000);
          const hrs = Math.floor(diffSec / 3600);
          const mins = Math.floor((diffSec % 3600) / 60);
          const secs = diffSec % 60;
          const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
          return { error: `⏱️ Twój gang może zaplanować kolejny skok za: **${leftStr}**.` };
        }

        if (client.gangHeists.has(user.gangId)) {
          return { error: '❌ Przygotowania do skoku już trwają!' };
        }

        gang.lastActivityAt = Date.now();
        return { success: true, gangId: user.gangId, gangName: gang.name, members: gang.members || [], tributePercent: gang.tributePercent || 0, mercenaryContracts: gang.mercenaryContracts || [] };
      });

      if (startResult.error) {
        await message.reply(startResult.error);
        return;
      }

      // Rozpocznij fazę zapisu
      client.gangHeists.set(startResult.gangId, {
        gangId: startResult.gangId,
        gangName: startResult.gangName,
        successChanceOverride: gangHeistSuccessOverride,
        initiatorId: message.author.id,
        participants: new Set([message.author.id]),
        endTime: Date.now() + 120000,
        originThreadId: message.guild?.id || message.rawEvent?.threadID || null,
        supportThreads: []
      });

      const memberTags = [];
      const tagsList = [];
      if (startResult.members) {
        for (const pid of startResult.members) {
          const name = await client.resolveUserName(pid);
          const tag = `@${name}`;
          tagsList.push(tag);
          memberTags.push({
            tag: tag,
            id: pid
          });
        }
      }
      const tagsString = tagsList.length > 0 ? tagsList.join(' ') : 'Brak członków';

      const threadId = message.guild?.id || message.rawEvent?.threadID;
      const activeMercs = (startResult.mercenaryContracts || []).filter(c => c && c.until > Date.now());
      const mercLines = activeMercs.length > 0
        ? activeMercs.map(c => `🪖 **${(MERCENARY_TYPES[c.type] && MERCENARY_TYPES[c.type].name) || c.type}** (pozostało: ${Math.max(0, Math.ceil((c.until - Date.now()) / 3600000))}h)`).join('\n')
        : '';
      const msgPayload = {
        body: `👥 **GANG HEIST (Skok Gangu)** 👥\n` +
          `**${message.author.username || 'Boss'}** zaplanował napad gangu **${startResult.gangName}**!\n\n` +
          `🚗 Wszyscy członkowie gangu mają **2 minuty**, aby dołączyć do akcji!\n` +
          `Członkowie: ${tagsString}\n\n` +
          `Wpisz: **!gang skok dolacz** (lub **!gang skok d**), aby wziąć udział.\n\n` +
          `💸 Haracz gangu: **${startResult.tributePercent}%**\n` +
          (mercLines ? `🪖 **Aktywne najemnicy:**\n${mercLines}\n` : '') +
          `⚠️ *Wymagane minimum 2 osoby (każdy min. 100 komend). Szansa na powodzenie: 50%. Wielkość łupu zależy od liczby uczestników (2-4: stacja paliw 50k-150k, 5-8: jubiler 150k-300k, 9-12: posiadłość 300k-500k, 13+: bank 500k-800k).*`,
        mentions: memberTags
      };

      if (client.api && threadId) {
        client.api.sendMessage(msgPayload, threadId);
      } else {
        await message.reply(msgPayload.body);
      }

      // Timer na wykonanie skoku po 2 minutach
      const heistGangId = startResult.gangId;
      const heistTimer = setTimeout(async () => {
        try {
          const heist = client.gangHeists.get(heistGangId);
          if (!heist) return;

          client.gangHeists.delete(heistGangId);

          const listParticipants = Array.from(heist.participants);
          if (listParticipants.length < 2) {
            const cancelMsg = `❌ Skok gangu **${heist.gangName}** został odwołany – zgłosiło się za mało uczestników (wymagane min. 2 osoby, zgłosiło się: ${listParticipants.length}).`;
            if (client.api && heist.originThreadId) {
              client.api.sendMessage({ body: cancelMsg }, heist.originThreadId);
            } else {
              console.log(`[GANG HEIST] ${cancelMsg}`);
            }
            return;
          }

          const heistOutcome = await withData(store => {
            store.profiles.gangs = store.profiles.gangs || {};
            const currentGang = store.profiles.gangs[heist.gangId];
            if (!currentGang) return { cancelled: true };

            currentGang.lastHeistTime = Date.now();

          // Calculate success chance: base from override + gang role bonuses (boss/deputy)
          let successChance = Number.isFinite(heist.successChanceOverride) ? heist.successChanceOverride / 100 : 0.50;
          const { getHouseGangBonus } = require('../utils/economy');
          for (const pid of listParticipants) {
            const pUser = createUser(pid, store.users);
            if (pUser.gangRole === 'boss') {
              successChance = Math.max(successChance, 0.55);
            } else if (pUser.gangRole === 'deputy') {
              successChance = Math.max(successChance, 0.525);
            }
            const gangBonus = getHouseGangBonus(pUser);
            if (gangBonus && gangBonus.strength > 0) {
              successChance += gangBonus.strength;
            }
          }
          const heistBonus = getGangBossShopMultiplier(currentGang, 'heist_success');
          successChance = Math.min(successChance + heistBonus, 0.95);
          const activeContracts = (currentGang.mercenaryContracts || []).filter(c => c && c.until > Date.now());
          const spiesCount = activeContracts.filter(c => c.type === 'szpiedzy').length;
          if (spiesCount > 0) {
            successChance = Math.min(successChance + 0.10 * spiesCount, 0.95);
          }

          const heistSuccess = Math.random() < successChance;

          if (!heistSuccess) {
            return { success: false };
          }

          currentGang.reputation = Math.max(0, (currentGang.reputation || 0) + 2);
          const repGainBonus = getTerritoryBonus(currentGang.id, 'reputation_gain');
          if (repGainBonus > 0) {
            currentGang.reputation = Math.max(0, currentGang.reputation + Math.floor(2 * repGainBonus));
          }

          // Wygrana w przedziale zależnym od liczby uczestników
          const count = listParticipants.length;
          let minReward = 60000;
          let maxReward = 400000;
          let heistType = 'Napad';

          if (count >= 2 && count <= 4) {
            heistType = 'Napad na stację paliw';
            minReward = 50000;
            maxReward = 150000;
          } else if (count >= 5 && count <= 8) {
            heistType = 'Napad na jubilera';
            minReward = 150000;
            maxReward = 300000;
          } else if (count >= 9 && count <= 12) {
            heistType = 'Napad na posiadłość';
            minReward = 300000;
            maxReward = 500000;
          } else if (count >= 13) {
            heistType = 'Napad na bank';
            minReward = 500000;
            maxReward = 800000;
          }

          const totalReward = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;
          const npcRaidBonus = getTerritoryBonus(currentGang.id, 'npc_raid');
          const heistIncomeBonus = getGangBossShopMultiplier(currentGang, 'heist_income');
          const finalTotalReward = Math.floor(totalReward * (1 + npcRaidBonus + heistIncomeBonus));
          const rewardPerPerson = Math.floor(finalTotalReward / listParticipants.length);

          // Rozdaj pieniądze każdemu uczestnikowi, obliczając haracza
          const tributePercent = currentGang.tributePercent || 0;
          let totalTribute = 0;
          const participantBonuses = {};
          const participantInsygnia = {};
          for (const pid of listParticipants) {
            const pUser = createUser(pid, store.users);
            const isExcluded = pUser.gangRole === 'boss' || pUser.gangRole === 'deputy';
            const tributeAmount = (!isExcluded && tributePercent > 0) ? Math.floor(rewardPerPerson * (tributePercent / 100)) : 0;
            totalTribute += tributeAmount;
            
            let finalReward = rewardPerPerson - tributeAmount;
            const inventory = ensureInventoryRecord(store.inventory, pid);
            
            const insygniaMultiplier = getPassiveMultiplier(inventory, 'insygnia_gang', 0.08);
            let insygniaBonus = 0;
            if (insygniaMultiplier > 0) {
              insygniaBonus = Math.floor(finalReward * insygniaMultiplier);
            }

            let godloBonus = 0;
            if (hasItem(inventory, 'godlo_gangu')) {
              godloBonus = Math.floor(finalReward * 0.10);
            }
            let krolewskieBonus = 0;
            if (hasItem(inventory, 'krolewskie_insygnia')) {
              krolewskieBonus = Math.floor(finalReward * 0.10);
            }
            const gangRewardsBonus = getItemSetBonus(inventory, 'gang_rewards');
            let gangRewardsBonusAmt = 0;
            if (gangRewardsBonus > 0) {
              gangRewardsBonusAmt = Math.floor(finalReward * gangRewardsBonus);
            }
            
            // Zbrojownia loot bonus
            const gangBonus = getHouseGangBonus(pUser);
            let zbrojowniaLootBonus = 0;
            if (gangBonus && gangBonus.loot > 0) {
              zbrojowniaLootBonus = Math.floor(finalReward * gangBonus.loot);
            }
            
            finalReward += godloBonus + insygniaBonus + krolewskieBonus + gangRewardsBonusAmt + zbrojowniaLootBonus;
            pUser.balance += finalReward;
            
            participantBonuses[pid] = godloBonus;
            participantInsygnia[pid] = insygniaBonus;
          }
          // Dodaj haracza do sejfu gangu
          const incomeBonus = getGangBossShopMultiplier(currentGang, 'income');
          currentGang.vault += Math.floor(totalTribute * (1 + incomeBonus));

          return {
            success: true,
            heistType,
            totalReward: finalTotalReward,
            rewardPerPerson,
            tributePercent,
            participantBonuses,
            participantInsygnia
          };
        });

        if (heistOutcome.cancelled) return;

        // Buduj listę nicków
        const names = listParticipants.map(pid => {
          return client.userNames.get(pid) || `Gracz_${pid.slice(-6)}`;
        }).join(', ');

        if (heistOutcome.success) {
          const tributePerPerson = Math.floor(heistOutcome.rewardPerPerson * ((heistOutcome.tributePercent || 0) / 100));
          const finalRewardPerPerson = heistOutcome.rewardPerPerson - tributePerPerson;
          const tributeText = tributePerPerson > 0 ? `\n💰 Haracza dla gangu: **-${formatCurrency(tributePerPerson)}** na osobę (nie dotyczy Bossa i Zastępców)` : '';
          
          let bonusText = '';
          const bonusPlayers = [];
          for (const pid of listParticipants) {
            const b = heistOutcome.participantBonuses[pid];
            const ins = heistOutcome.participantInsygnia[pid];
            const name = client.userNames.get(pid) || `Gracz_${pid.slice(-6)}`;
            const playerBonuses = [];
            if (b > 0) {
              playerBonuses.push(`**+${formatCurrency(b)}** (🛡️ Godło)`);
            }
            if (ins > 0) {
              playerBonuses.push(`**+${formatCurrency(ins)}** (🩶 Insygnia)`);
            }
            if (playerBonuses.length > 0) {
              bonusPlayers.push(`• **${name}**: ${playerBonuses.join(' + ')}`);
            }
          }
          if (bonusPlayers.length > 0) {
            bonusText = `\n\n✨ **Bonusy z przedmiotów:**\n` + bonusPlayers.join('\n');
          }

          const successMsg = `💰 **SKOK GANGU ZAKOŃCZONY SUKCESEM!** 💰\n` +
            `Ekipa w składzie: **${names}** przeprowadziła pomyślnie: **${heistOutcome.heistType}**!\n\n` +
            `💵 Całkowity łup: **${formatCurrency(heistOutcome.totalReward)}**\n` +
            `💸 Każdy z uczestników otrzymuje: **+${formatCurrency(finalRewardPerPerson)}**${tributeText}${bonusText}`;
          if (client.api && heist.originThreadId) {
            client.api.sendMessage({ body: successMsg }, heist.originThreadId);
          } else {
            console.log(`[GANG HEIST] ${successMsg}`);
          }
          notifySupportThreads(client, heist, successMsg);
        } else {
          const failMsg = `🚨 **SKOK ZAKOŃCZYŁ SIĘ WPADKĄ!** 🚨\n` +
            `Ekipa w składzie: **${names}** została osaczona przez policję.\n\n` +
            `💥 Akcja spaliła na panewce. Nikt nic nie zarobił, a krupier nałożył 1h cooldownu na kolejne skoki.`;
          if (client.api && heist.originThreadId) {
            client.api.sendMessage({ body: failMsg }, heist.originThreadId);
          } else {
            console.log(`[GANG HEIST] ${failMsg}`);
          }
          notifySupportThreads(client, heist, failMsg);
        }
      } catch (err) {
        console.error('[GANG HEIST] Błąd podczas rozwiązywania skoku gangu:', err);
      }
      }, 120000);

      return;
    }

    // ==========================================
    // 10. GANG WAR / ATTACK (!gang atak / !gang wojna)
    // ==========================================
    if (sub === 'atak' || sub === 'wojna' || sub === 'obrona') {
      if (!client.activeGangWars) {
        client.activeGangWars = new Map();
      }

      const action = String(args[1] || '').toLowerCase();

      if (action === 'dolacz' || action === 'd') {
        const joinResult = await withData(store => {
          store.profiles.gangs = store.profiles.gangs || {};
          const user = getGangUser(store, message.author.id);

          if (!user.gangId || !store.profiles.gangs[user.gangId]) {
            return { error: '❌ Nie należysz do żadnego gangu.' };
          }

          const myGangId = String(user.gangId);

          // Find if there is an active war involving this gang
          let foundWar = null;
          let foundAttackerId = null;
          let isAttackingSide = false;

          for (const [attId, war] of client.activeGangWars.entries()) {
            const isAttackerKey = String(attId) === myGangId || String(war.aiAttackerGangId || '') === myGangId;
            const isDefenderTarget = String(war.defenderGangId || '') === myGangId;
            if (isAttackerKey) {
              foundWar = war;
              foundAttackerId = attId;
              isAttackingSide = true;
              break;
            } else if (isDefenderTarget) {
              foundWar = war;
              foundAttackerId = attId;
              isAttackingSide = false;
              break;
            }
          }

          if (!foundWar) {
            return { error: '❌ Twój gang nie uczestniczy obecnie w żadnej wojnie.' };
          }

          if (isAttackingSide) {
            if (foundWar.attackers.has(message.author.id)) {
              return { error: '❌ Już dołączyłeś do ataku swojego gangu.' };
            }
            foundWar.attackers.add(message.author.id);
            const myGang = store.profiles.gangs[myGangId];
            if (myGang) myGang.lastActivityAt = Date.now();
            return { success: true, side: 'atakujących', count: foundWar.attackers.size };
          } else {
            if (foundWar.defenders.has(message.author.id)) {
              return { error: '❌ Już dołączyłeś do obrony swojego gangu.' };
            }
            foundWar.defenders.add(message.author.id);
            const myGang = store.profiles.gangs[myGangId];
            if (myGang) myGang.lastActivityAt = Date.now();
            return { success: true, side: 'obrońców', count: foundWar.defenders.size };
          }
        });

        if (joinResult.error) {
          await message.reply(joinResult.error);
          return;
        }

        await message.reply(`⚔️ Pomyślnie dołączyłeś do **${joinResult.side}**! Razem w zespole: **${joinResult.count}** osób.`);
        return;
      }

      // Starting an attack
      const targetParam = args.slice(1).join(' ').trim();
      if (!targetParam) {
        await message.reply('❌ Użyj: **!gang atak @osoba**, **!gang atak <ID gracza>**, **!gang atak <nazwa gangu>** lub **!gang atak dolacz** / **!gang obrona dolacz**');
        return;
      }

      const startResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);
        const inventory = ensureInventoryRecord(store.inventory, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const myGangId = user.gangId;
        const myGang = store.profiles.gangs[myGangId];
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';

        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą rozpocząć wojnę gangów.' };
        }

        if (myGang.vault < 500000) {
          return { error: `❌ Twój gang musi mieć minimum ${formatCurrency(500000)} w sejfie, aby rozpocząć wojnę.` };
        }

        // Resolve target gang: po oznaczeniu/ID gracza, po ID gangu, lub po nazwie gangu
        let targetGangId = null;
        let targetId = null;

        const mentioned = message.mentions.users.first();
        if (mentioned) {
          targetId = mentioned.id;
        } else if (/^\d+$/.test(targetParam) && targetParam.length >= 8) {
          targetId = targetParam;
        }

        if (targetId) {
          const targetUser = store.users[targetId];
          if (targetUser && targetUser.gangId) {
            targetGangId = targetUser.gangId;
          }
        }

        if (!targetGangId && targetParam) {
          const cleanParam = targetParam.toLowerCase();
          if (store.profiles.gangs[cleanParam]) {
            targetGangId = cleanParam;
          } else {
            const foundGang = Object.entries(store.profiles.gangs).find(
              ([id, g]) => g.name.toLowerCase() === cleanParam
            );
            if (foundGang) targetGangId = foundGang[0];
          }
        }

        if (!targetGangId) {
          return { error: '❌ Musisz oznaczyć osobę (@osoba), podać jej ID, lub podać nazwę/ID gangu, aby go zaatakować.' };
        }

        if (targetGangId === myGangId) {
          return { error: '❌ Nie możesz zaatakować własnego gangu.' };
        }

        const defenderGang = store.profiles.gangs[targetGangId];

        if (myGang.alliances && myGang.alliances.includes(targetGangId)) {
          return { error: `❌ Masz sojusz z gangiem **${defenderGang.name}**. Nie możecie się atakować!` };
        }

        // Check if either gang is currently in a war
        if (client.activeGangWars.has(myGangId)) {
          return { error: '❌ Twój gang już uczestniczy w wojnie!' };
        }

        for (const [attId, war] of client.activeGangWars.entries()) {
          if (war.defenderGangId === myGangId) {
            return { error: '❌ Twój gang jest obecnie atakowany!' };
          }
          if (attId === targetGangId || war.defenderGangId === targetGangId) {
            return { error: `❌ Gang **${defenderGang.name}** jest już zaangażowany w inną wojnę!` };
          }
        }

        // Check 24h attack cooldown
        const now = Date.now();
        const lastAttack = myGang.lastAttackTime || 0;
        let cooldown = 12 * 60 * 60 * 1000;
        const attCdBonus = getGangBossShopMultiplier(myGang, 'cooldown');
        if (attCdBonus > 0) {
          cooldown = Math.floor(cooldown * (1 - attCdBonus));
        }
        const { getGlobalCooldownReduction } = require('../utils/economy');
        const attGlobalCdReduction = getGlobalCooldownReduction(inventory);
        if (attGlobalCdReduction > 0) {
          cooldown = Math.floor(cooldown * (1 - attGlobalCdReduction));
        }
        if (now - lastAttack < cooldown) {
          const diffSec = Math.ceil((cooldown - (now - lastAttack)) / 1000);
          const hrs = Math.floor(diffSec / 3600);
          const mins = Math.floor((diffSec % 3600) / 60);
          const secs = diffSec % 60;
          const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
          return { error: `⏱️ Twój gang może zaatakować ponownie za: **${leftStr}**.` };
        }

        // Check 6h defender protection shield
        const shieldUntil = defenderGang.shieldUntil || 0;
        if (now < shieldUntil) {
          const diffSec = Math.ceil((shieldUntil - now) / 1000);
          const hrs = Math.floor(diffSec / 3600);
          const mins = Math.floor((diffSec % 3600) / 60);
          const secs = diffSec % 60;
          const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
          return { error: `🛡️ Gang **${defenderGang.name}** posiada aktywną tarczę ochronną. Można ich zaatakować za: **${leftStr}**.` };
        }

        // Cost is 10% of current vault balance
        const cost = Math.floor(myGang.vault * 0.10);
        myGang.vault -= cost;
        myGang.lastAttackTime = now;
        myGang.lastActivityAt = Date.now();

        let shieldDuration = 6 * 60 * 60 * 1000;
        if (hasReputationBonus(defenderGang, 1500)) {
          shieldDuration -= 1 * 60 * 60 * 1000;
        }
        const shieldReduction = getTerritoryBonus(defenderGang.id, 'shield_reduction');
        if (shieldReduction > 0) {
          shieldDuration = Math.max(0, shieldDuration - shieldReduction);
        }
        defenderGang.shieldUntil = now + shieldDuration;

        return {
          success: true,
          attackerGangId: myGangId,
          attackerGangName: myGang.name,
          defenderGangId: targetGangId,
          defenderGangName: defenderGang.name,
          cost,
          defenderVault: defenderGang.vault || 0,
          attackerMembers: myGang.members || [],
          defenderMembers: defenderGang.members || [],
          attackerMercenaryContracts: myGang.mercenaryContracts || [],
          defenderMercenaryContracts: defenderGang.mercenaryContracts || []
        };
      });

      if (startResult.error) {
        await message.reply(startResult.error);
        return;
      }

      // Znajdź grupę z największą liczbą członków gangu obrońcy
      const activeThreadsForDefender = Array.from(client.activeThreadIds || []);
      let defenderThreadId = null;
      let maxDefenderCount = 0;

      const defenderMemberIds = new Set(startResult.defenderMembers || []);
      const defenderUsers = await withData(store => {
        const map = {};
        for (const uid of defenderMemberIds) {
          map[uid] = store.users[uid];
        }
        return map;
      });

      for (const tId of activeThreadsForDefender) {
        let count = 0;
        for (const mid of startResult.defenderMembers || []) {
          const member = defenderUsers[mid];
          if (member && member.lastActiveThreadId === tId) count++;
        }
        if (count > maxDefenderCount) {
          maxDefenderCount = count;
          defenderThreadId = tId;
        }
      }

      // Initialize the war
      client.activeGangWars.set(startResult.attackerGangId, {
        attackerGangId: startResult.attackerGangId,
        attackerGangName: startResult.attackerGangName,
        defenderGangId: startResult.defenderGangId,
        defenderGangName: startResult.defenderGangName,
        initiatorId: message.author.id,
        attackers: new Set([message.author.id]),
        defenders: new Set(),
        endTime: Date.now() + 120000,
        originThreadId: message.guild?.id || message.rawEvent?.threadID || null,
        defenderThreadId: defenderThreadId || null
      });

      const attackerTags = [];
      const attackerMentions = [];
      if (startResult.attackerMembers) {
        for (const pid of startResult.attackerMembers) {
          const name = await client.resolveUserName(pid);
          const tag = `@${name}`;
          attackerTags.push(tag);
          attackerMentions.push({ tag, id: pid });
        }
      }
      const attackerTagsString = attackerTags.length > 0 ? attackerTags.join(' ') : 'Brak';

      const defenderTags = [];
      const defenderMentions = [];
      if (startResult.defenderMembers) {
        for (const pid of startResult.defenderMembers) {
          const name = await client.resolveUserName(pid);
          const tag = `@${name}`;
          defenderTags.push(tag);
          defenderMentions.push({ tag, id: pid });
        }
      }
      const defenderTagsString = defenderTags.length > 0 ? defenderTags.join(' ') : 'Brak';

      const threadIdVal = message.guild?.id || message.rawEvent?.threadID;
      const attackerMercs = (startResult.attackerMercenaryContracts || []).filter(c => c && c.until > Date.now());
      const defenderMercs = (startResult.defenderMercenaryContracts || []).filter(c => c && c.until > Date.now());
      const attackerMercLine = attackerMercs.length > 0
        ? `🪖 Najemnicy (atakujący): ${attackerMercs.map(c => `**${(MERCENARY_TYPES[c.type] && MERCENARY_TYPES[c.type].name) || c.type}**`).join(', ')}\n`
        : '';
      const defenderMercLine = defenderMercs.length > 0
        ? `🪖 Najemnicy (obrońcy): ${defenderMercs.map(c => `**${(MERCENARY_TYPES[c.type] && MERCENARY_TYPES[c.type].name) || c.type}**`).join(', ')}\n`
        : '';
      const msgPayload = {
        body: `⚔️ **WOJNA GANGÓW: NAPAD NA SEJF!** ⚔️\n` +
          `**${message.author.username || 'Boss'}** (Zastępca/Boss gangu **${startResult.attackerGangName}**) wypowiedział wojnę gangowi **${startResult.defenderGangName}**!\n\n` +
          `💸 Koszt przygotowania ataku: **-${formatCurrency(startResult.cost)}** z sejfu gangu.\n` +
          `🎯 Cel: Kradzież od **15% do 35%** wrogiego sejfu (obecnie: **${formatCurrency(startResult.defenderVault)}**).\n\n` +
          `⚔️ **Atakujący (${startResult.attackerGangName}):** ${attackerTagsString}\n` +
          (attackerMercLine ? attackerMercLine : '') +
          `🛡️ **Obrońcy (${startResult.defenderGangName}):** ${defenderTagsString}\n` +
          (defenderMercLine ? defenderMercLine : '') +
          `🚗 Członkowie obu gangów mają **2 minuty**, aby dołączyć do walki!\n` +
          `Wpisz: **!gang atak dolacz** / **!gang obrona dolacz**, aby wesprzeć swój gang!`,
        mentions: [...attackerMentions, ...defenderMentions]
      };

      if (client.api && threadIdVal) {
        client.api.sendMessage(msgPayload, threadIdVal);
      }
      if (client.api && defenderThreadId && defenderThreadId !== threadIdVal) {
        client.api.sendMessage(msgPayload, defenderThreadId);
      }
      if (!client.api) {
        await message.reply(msgPayload.body);
      }

      // Timer to resolve the war after 2 minutes
      const warTimer = setTimeout(async () => {
        try {
          const attackerGangId = startResult.attackerGangId;
          const war = client.activeGangWars.get(attackerGangId);
          if (!war) return;

          client.activeGangWars.delete(attackerGangId);

          const listAttackers = Array.from(war.attackers);
          const listDefenders = Array.from(war.defenders);

          const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

          // Resolve outcome inside withData
          const outcome = await withData(store => {
            store.profiles.gangs = store.profiles.gangs || {};
            const attackerGang = store.profiles.gangs[war.attackerGangId];
            const defenderGang = store.profiles.gangs[war.defenderGangId];

          if (!attackerGang || !defenderGang) {
            return { cancelled: true };
          }

          // Calculate Attack Power
          const membersForPower = attackerGang.members.length;
          const membersForReward = listAttackers.length;
          const membersForPowerDef = defenderGang.members.length;
          const membersForRewardDef = listDefenders.length;
          const effectiveAttackerCount = membersForPower + getMercenaryPowerBonus(attackerGang, 'attack');
          const effectiveDefenderCount = membersForPowerDef + getMercenaryPowerBonus(defenderGang, 'defense');

          let baseAttackPower = 0;
          for (let i = 0; i < effectiveAttackerCount; i++) {
            baseAttackPower += randomInt(15, 60);
          }
          const attFachLvl = attackerGang.levelFach || 0;
          const attBossBonus = getGangBossShopMultiplier(attackerGang, 'attack');
          const territoryAttBonus = getTerritoryBonus(attackerGang.id, 'gang_attack') + getTerritoryBonus(attackerGang.id, 'war_both');
          const rawAttackPower = Math.floor(baseAttackPower * (1 + 0.15 * attFachLvl + attBossBonus + territoryAttBonus));
          const attackPower = Math.floor(rawAttackPower * (1 + getWeaponMultiplier(attackerGang) + getSpecialGangMultiplier(attackerGang, 'attack')));

          // Calculate Defense Power
          let baseDefensePower = 0;
          if (effectiveDefenderCount > 0) {
            for (let i = 0; i < effectiveDefenderCount; i++) {
              baseDefensePower += randomInt(15, 60);
            }
          }
          const defFachLvl = defenderGang.levelFach || 0;
          const defBossBonus = getGangBossShopMultiplier(defenderGang, 'defense');
          const territoryDefBonus = getTerritoryBonus(defenderGang.id, 'gang_defense') + getTerritoryBonus(defenderGang.id, 'war_both');
          const rawDefensePower = effectiveDefenderCount > 0 ? Math.floor(baseDefensePower * (1 + 0.15 * defFachLvl + defBossBonus + territoryDefBonus)) : 0;
          const defensePower = Math.floor(rawDefensePower * (1 + getDefenseUpgradeMultiplier(defenderGang) + getSpecialGangMultiplier(defenderGang, 'defense')));

          // Determine Success
          let winChance = 0.95;
          if (defensePower > 0) {
            winChance = attackPower / (attackPower + defensePower);
          }
          const success = Math.random() < winChance;

          const attackerRepBefore = Math.max(0, Math.floor(attackerGang.reputation || 0));
          const defenderRepBefore = Math.max(0, Math.floor(defenderGang.reputation || 0));
          let attackerRepChange = 0;
          let defenderRepChange = 0;

          if (success) {
            attackerRepChange += 10;
            defenderRepChange -= 5;
            if (defenderRepBefore > attackerRepBefore || (defenderGang.levelFach || 0) > (attackerGang.levelFach || 0)) {
              attackerRepChange += 10;
            }
          } else {
            attackerRepChange -= 5;
            defenderRepChange += 5;
            if (attackerRepBefore > defenderRepBefore || (attackerGang.levelFach || 0) > (defenderGang.levelFach || 0)) {
              defenderRepChange += 10;
            }
          }

          const attackerRepGainBonus = getTerritoryBonus(attackerGang.id, 'reputation_gain');
          const defenderRepGainBonus = getTerritoryBonus(defenderGang.id, 'reputation_gain');
          if (attackerRepGainBonus > 0) {
            attackerRepChange = Math.floor(attackerRepChange * (1 + attackerRepGainBonus));
          }
          if (defenderRepGainBonus > 0) {
            defenderRepChange = Math.floor(defenderRepChange * (1 + defenderRepGainBonus));
          }

          attackerGang.reputation = Math.max(0, attackerRepBefore + attackerRepChange);
          defenderGang.reputation = Math.max(0, defenderRepBefore + defenderRepChange);

          if (success) {
            // Success Loot: 15% to 35% of defender's vault
            const pct = randomInt(15, 35) / 100;
            const baseStolen = Math.floor(defenderGang.vault * pct);
            const lootMult = 1 + getGangBossShopMultiplier(attackerGang, 'loot');
            const stolenTotal = Math.min(defenderGang.vault, Math.floor(baseStolen * lootMult));
            
            defenderGang.vault = Math.max(0, defenderGang.vault - stolenTotal);
            
            const vaultShare = Math.floor(stolenTotal * 0.30);
            const membersTotalShare = stolenTotal - vaultShare;
            const sharePerPerson = membersForReward > 0 ? Math.floor(membersTotalShare / membersForReward) : 0;

            const incomeBonus = getGangBossShopMultiplier(attackerGang, 'income');
            attackerGang.vault += Math.floor(vaultShare * (1 + incomeBonus));

            const stolenItemId = attemptStealBossItem(attackerGang, defenderGang);
            if (stolenItemId) {
              defenderGang.bossShopItems = (defenderGang.bossShopItems || []).filter(id => id !== stolenItemId);
              attackerGang.bossShopItems = attackerGang.bossShopItems || [];
              attackerGang.bossShopItems.push(stolenItemId);
            }

            const zetonWinners = [];
            const attackerBonuses = {};
            for (const pid of listAttackers) {
              const pUser = createUser(pid, store.users);
               let finalShare = sharePerPerson;
               const inventory = ensureInventoryRecord(store.inventory, pid);
               
               const insygniaMultiplier = getPassiveMultiplier(inventory, 'insygnia_gang', 0.08);
               let insygniaBonus = 0;
               if (insygniaMultiplier > 0) {
                 insygniaBonus = Math.floor(finalShare * insygniaMultiplier);
               }

               let godloBonus = 0;
               if (hasItem(inventory, 'godlo_gangu')) {
                 godloBonus = Math.floor(finalShare * 0.05);
               }
               let krolewskieBonus = 0;
               if (hasItem(inventory, 'krolewskie_insygnia')) {
                 krolewskieBonus = Math.floor(finalShare * 0.10);
               }
               const gangRewardsBonus = getItemSetBonus(inventory, 'gang_rewards');
               let gangRewardsBonusAmt = 0;
               if (gangRewardsBonus > 0) {
                 gangRewardsBonusAmt = Math.floor(finalShare * gangRewardsBonus);
               }
               
               finalShare += godloBonus + insygniaBonus + krolewskieBonus + gangRewardsBonusAmt;
              pUser.balance += finalShare;
              attackerBonuses[pid] = { godlo: godloBonus, insygnia: insygniaBonus };
              
              if (Math.random() < 0.04) {
                const pInv = ensureInventoryRecord(store.inventory, pid);
                addItem(pInv, 'krwawy_zeton', 1);
                zetonWinners.push(pid);
              }
            }

            return {
              success: true,
              attackPower,
              defensePower,
              stolenTotal,
              vaultShare,
              sharePerPerson,
              zetonWinners,
              attackerBonuses,
              stolenItemId
            };
          } else {
            // Failure Penalty:
            // 20% to defender's vault
            // 15% divided equally among defending players' wallets
            const penaltyVault = Math.floor(attackerGang.vault * 0.20);
            const penaltyDefenders = Math.floor(attackerGang.vault * 0.15);
            const warLossReduction = getTerritoryBonus(attackerGang.id, 'war_loss_reduction');
            const reducedPenaltyVault = Math.floor(penaltyVault * (1 - warLossReduction));
            const reducedPenaltyDefenders = Math.floor(penaltyDefenders * (1 - warLossReduction));
            const totalPenalty = reducedPenaltyVault + reducedPenaltyDefenders;

            attackerGang.vault = Math.max(0, attackerGang.vault - totalPenalty);
            const defenderIncomeBonus = getGangBossShopMultiplier(defenderGang, 'income');
            defenderGang.vault += Math.floor(reducedPenaltyVault * (1 + defenderIncomeBonus));
            const vaultReturnBonus = getGangBossShopMultiplier(attackerGang, 'vault_return');
            if (vaultReturnBonus > 0) {
              const returnedVault = Math.floor(reducedPenaltyVault * vaultReturnBonus);
              attackerGang.vault += returnedVault;
            }

            let sharePerDefender = 0;
            const defenderBonuses = {};
            if (membersForRewardDef > 0) {
              sharePerDefender = Math.floor(penaltyDefenders / membersForRewardDef);
              for (const pid of listDefenders) {
                const pUser = createUser(pid, store.users);
                 let finalShare = sharePerDefender;
                 const inventory = ensureInventoryRecord(store.inventory, pid);
                 
                 const insygniaMultiplier = getPassiveMultiplier(inventory, 'insygnia_gang', 0.08);
                 let insygniaBonus = 0;
                 if (insygniaMultiplier > 0) {
                   insygniaBonus = Math.floor(finalShare * insygniaMultiplier);
                 }

                 let godloBonus = 0;
                 if (hasItem(inventory, 'godlo_gangu')) {
                   godloBonus = Math.floor(finalShare * 0.05);
                 }
                 let krolewskieBonus = 0;
                 if (hasItem(inventory, 'krolewskie_insygnia')) {
                   krolewskieBonus = Math.floor(finalShare * 0.10);
                 }
                 const gangRewardsBonus = getItemSetBonus(inventory, 'gang_rewards');
                 let gangRewardsBonusAmt = 0;
                 if (gangRewardsBonus > 0) {
                   gangRewardsBonusAmt = Math.floor(finalShare * gangRewardsBonus);
                 }
                 
                 finalShare += godloBonus + insygniaBonus + krolewskieBonus + gangRewardsBonusAmt;
                pUser.balance += finalShare;
                defenderBonuses[pid] = { godlo: godloBonus, insygnia: insygniaBonus };
              }
            } else {
              // If there were no defending players checked in, the 15% goes to defender's vault
              const defenderIncomeBonus = getGangBossShopMultiplier(defenderGang, 'income');
              defenderGang.vault += Math.floor(penaltyDefenders * (1 + defenderIncomeBonus));
            }

            const stolenItemId = attemptStealBossItem(defenderGang, attackerGang);
            if (stolenItemId) {
              attackerGang.bossShopItems = (attackerGang.bossShopItems || []).filter(id => id !== stolenItemId);
              defenderGang.bossShopItems = defenderGang.bossShopItems || [];
              defenderGang.bossShopItems.push(stolenItemId);
            }

            return {
              success: false,
              attackPower,
              defensePower,
              penaltyVault,
              penaltyDefenders,
              sharePerDefender,
              totalPenalty,
              defenderBonuses,
              stolenItemId
            };
          }
        });

        if (outcome.cancelled) return;

        // Resolve names for notification
        const getNamesString = async (ids) => {
          const namesList = await Promise.all(ids.map(async id => {
            if (client.userNames.has(id)) return client.userNames.get(id);
            return `Gracz_${id.slice(-6)}`;
          }));
          return namesList.join(', ');
        };

        const attackerNames = await getNamesString(listAttackers);
        const defenderNames = listDefenders.length > 0 ? await getNamesString(listDefenders) : 'Brak';

        if (outcome.success) {
          let zetonNote = '';
          if (outcome.zetonWinners && outcome.zetonWinners.length > 0) {
            const zetonNames = await getNamesString(outcome.zetonWinners);
            zetonNote = `\n🎁 **LEGENDA WOJENNA!** Uczestnicy: **${zetonNames}** zdobyli 🩸 **Krwawy Żeton**!`;
          }

          let godloNote = '';
          const godloPlayers = [];
          for (const pid of listAttackers) {
            const b = outcome.attackerBonuses[pid];
            if (b) {
              const name = client.userNames.get(pid) || `Gracz_${pid.slice(-6)}`;
              const playerBonuses = [];
              if (b.godlo > 0) playerBonuses.push(`**+${formatCurrency(b.godlo)}** (🛡️ Godło)`);
              if (b.insygnia > 0) playerBonuses.push(`**+${formatCurrency(b.insygnia)}** (🩶 Insygnia)`);
              if (playerBonuses.length > 0) {
                godloPlayers.push(`• **${name}**: ${playerBonuses.join(' + ')}`);
              }
            }
          }
          if (godloPlayers.length > 0) {
            godloNote = `\n\n✨ **Bonusy z przedmiotów:**\n` + godloPlayers.join('\n');
          }

          const attackerMsg =
            `⚔️ **WOJNA GANGÓW ZAKOŃCZONA SUKCESEM!** ⚔️\n` +
            `Gang **${war.attackerGangName}** zniszczył obronę gangu **${war.defenderGangName}**!\n\n` +
            `🪓 Siła ataku: **${outcome.attackPower}** vs 🛡️ Siła obrony: **${outcome.defensePower}**\n\n` +
            `💰 **ŁUP WOJENNY:**\n` +
            `• Skradziono z sejfu broniącego: **${formatCurrency(outcome.stolenTotal)}**\n` +
            `• Trafiło do sejfu atakujących: **${formatCurrency(outcome.vaultShare)}**\n` +
            `• Każdy z atakujących otrzymuje: **${formatCurrency(outcome.sharePerPerson)}**` +
            (zetonNote || godloNote ? `\n\n${zetonNote}${godloNote}` : '') +
            (outcome.stolenItemId ? `\n\n🎒 **ŁUP SPECJALNY:** Gang przejął przedmiot **${getItemEmoji(outcome.stolenItemId)} ${getItemName(outcome.stolenItemId)}** z Bossowego Sklepu przeciwnika!` : '');

          const defenderMsg =
            `🚨 **WASZ SEJF ZOSTAŁ ZAATAKOWANY!** 🚨\n` +
            `Gang **${war.attackerGangName}** przełamał obronę Waszego gangu **${war.defenderGangName}**!\n\n` +
            `🪓 Siła ataku: **${outcome.attackPower}** vs 🛡️ Siła obrony: **${outcome.defensePower}**\n\n` +
            `💸 **STRATY WASZEGO GANGU:**\n` +
            `• Skradziono z Waszego sejfu: **${formatCurrency(outcome.stolenTotal)}**\n` +
            `• Trafiło do sejfu przeciwnika: **${formatCurrency(outcome.vaultShare)}**\n` +
            `• Każdy z atakujących zarobił: **${formatCurrency(outcome.sharePerPerson)}** na osobę!` +
            (outcome.stolenItemId ? `\n\n🎒 **UTRACONY ŁUP:** Gang **${war.attackerGangName}** przejął przedmiot **${getItemEmoji(outcome.stolenItemId)} ${getItemName(outcome.stolenItemId)}** z Waszego Bossowego Sklepu!` : '');

          if (client.api && war.originThreadId) {
            client.api.sendMessage(attackerMsg, war.originThreadId);
          }
          if (client.api && war.defenderThreadId && war.defenderThreadId !== war.originThreadId) {
            client.api.sendMessage(defenderMsg, war.defenderThreadId);
          }
        } else {
          let godloNote = '';
          const godloPlayers = [];
          for (const pid of listDefenders) {
            const b = outcome.defenderBonuses[pid];
            if (b) {
              const name = client.userNames.get(pid) || `Gracz_${pid.slice(-6)}`;
              const playerBonuses = [];
              if (b.godlo > 0) playerBonuses.push(`**+${formatCurrency(b.godlo)}** (🛡️ Godło)`);
              if (b.insygnia > 0) playerBonuses.push(`**+${formatCurrency(b.insygnia)}** (🩶 Insygnia)`);
              if (playerBonuses.length > 0) {
                godloPlayers.push(`• **${name}**: ${playerBonuses.join(' + ')}`);
              }
            }
          }
          if (godloPlayers.length > 0) {
            godloNote = `\n\n✨ **Bonusy z przedmiotów:**\n` + godloPlayers.join('\n');
          }

          const defenderDistributionAttackerView = listDefenders.length > 0
            ? `Każdy obrońca (**${defenderNames}**) otrzymuje: **+${formatCurrency(outcome.sharePerDefender)}** do portfela!`
            : `Ponieważ nikt nie bronił gangu osobiście, całe **${formatCurrency(outcome.totalPenalty)}** zasiliło sejf broniących!`;

          const attackerMsg =
            `🛡️ **ATAK ODPARTY! OBRONA GÓRĄ!** 🛡️\n` +
            `Gang **${war.defenderGangName}** skutecznie obronił swój skarbiec przed gangiem **${war.attackerGangName}**!\n\n` +
            `🪓 Siła ataku: **${outcome.attackPower}** vs 🛡️ Siła obrony: **${outcome.defensePower}**\n\n` +
            `💸 **KONSEKWENCJE PORAŻKI:**\n` +
            `• Skradziono z sejfu atakujących: **${formatCurrency(outcome.totalPenalty)}**\n` +
            `• Trafiło do sejfu broniących: **${formatCurrency(outcome.penaltyVault)}**\n` +
            `• Każdy uczestnik broniących otrzymuje: **${formatCurrency(outcome.sharePerDefender)}**${godloNote}` +
            (outcome.stolenItemId ? `\n\n🎒 **ŁUP OBRONNY:** Gang obrońcy przejął przedmiot **${getItemEmoji(outcome.stolenItemId)} ${getItemName(outcome.stolenItemId)}** z Bossowego Sklepu atakujących!` : '');

          const defenderMsg =
            `🛡️ **OBRONILIŚCIE SIĘ!** 🛡️\n` +
            `Gang **${war.attackerGangName}** próbował zaatakować Wasz sejf, ale poniósł porażkę!\n\n` +
            `🪓 Siła ataku: **${outcome.attackPower}** vs 🛡️ Siła obrony: **${outcome.defensePower}**\n\n` +
            `💰 **ZYSKI Z OBRONY:**\n` +
            `• Skradziono z sejfu atakujących: **${formatCurrency(outcome.totalPenalty)}**\n` +
            `• Do Waszego sejfu trafiło: **${formatCurrency(outcome.penaltyVault)}**\n` +
            `• Każdy z Was, kto bronił, otrzymuje: **${formatCurrency(outcome.sharePerDefender)}**` +
            (outcome.stolenItemId ? `\n\n🎒 **ŁUP OBRONNY:** Przejęliście przedmiot **${getItemEmoji(outcome.stolenItemId)} ${getItemName(outcome.stolenItemId)}** z Bossowego Sklepu gangu **${war.attackerGangName}**!` : '');

          if (client.api && war.originThreadId) {
            client.api.sendMessage(attackerMsg, war.originThreadId);
          }
          if (client.api && war.defenderThreadId && war.defenderThreadId !== war.originThreadId) {
            client.api.sendMessage(defenderMsg, war.defenderThreadId);
          }
        }
      } catch (err) {
        console.error('[GANG WAR] Błąd podczas rozwiązywania wojny gangów:', err);
      }
      }, 120000);

      return;
    }

    // ==========================================
    // 10b. GANG EQ
    // ==========================================
    if (sub === 'eq') {
      const eqResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        let targetGangId = null;

        const mentioned = message.mentions.users.first();
        let targetUserId = null;
        if (mentioned) {
          targetUserId = mentioned.id;
        } else if (args[1] && /^\d+$/.test(args[1]) && args[1].length >= 8) {
          targetUserId = args[1];
        }

        if (targetUserId) {
          const tgtUser = store.users[targetUserId];
          if (tgtUser && tgtUser.gangId) {
            targetGangId = tgtUser.gangId;
          }
        }

        if (!targetGangId) {
          const targetParam = args.slice(1).join(' ').trim().toLowerCase();
          if (targetParam && store.profiles.gangs[targetParam]) {
            targetGangId = targetParam;
          } else if (targetParam) {
            const foundGang = Object.entries(store.profiles.gangs).find(
              ([id, g]) => g.name.toLowerCase() === targetParam
            );
            if (foundGang) targetGangId = foundGang[0];
          }
        }

        if (!targetGangId) {
          targetGangId = user.gangId;
        }

        if (!targetGangId || !store.profiles.gangs[targetGangId]) {
          return { notFound: true };
        }

        const gang = store.profiles.gangs[targetGangId];
        const items = (gang.bossShopItems || []).map((itemId, idx) => {
          const def = getItemDefinition(itemId);
          if (def) {
            return `${idx + 1}. ${def.emoji} **${def.name}** — ${def.description}`;
          }
          return `${idx + 1}. 📦 **${itemId}**`;
        });

        return {
          notFound: false,
          gangName: gang.name,
          items
        };
      });

      if (eqResult.notFound) {
        await message.reply('❌ Nie znaleziono gangu dla podanej nazwy, osoby lub ID.');
        return;
      }

      const itemsList = eqResult.items.length > 0
        ? eqResult.items.join('\n')
        : '📦 Ten gang nie posiada jeszcze żadnych przedmiotów z Bossowego Sklepu. Boss może je kupić komendą **!gang sklep**.';

      await message.reply(
        `🛒 **Przedmioty Bossowego Sklepu — Gang: ${eqResult.gangName}**\n\n` +
        itemsList
      );
      return;
    }

    // ==========================================
    // 10d. GANG ARTEFAKTY
    // ==========================================
    if (sub === 'artefakty' || sub === 'artf') {
      const secondArg = String(args[1] || '').toLowerCase();
      const thirdArg = String(args[2] || '').toLowerCase();

      const crates = getAllCrateDefinitions();
      const regularItems = [];
      let regularNum = 0;
      for (const crateId of CRATE_ORDER) {
        const crate = crates[crateId];
        for (const [itemId, def] of Object.entries(crate.items || {})) {
          regularNum++;
          regularItems.push({
            num: regularNum,
            id: itemId,
            name: def.name,
            emoji: def.emoji,
            description: def.description,
            crateName: crate.name,
            crateEmoji: crate.emoji
          });
        }
      }

      const seasonRewards = [];
      const rewardIds = ['korona_hegemonii', 'lepsze_ufortyfikowanie', 'kodeks_honoru'];
      for (let i = 0; i < rewardIds.length; i++) {
        const rewardId = rewardIds[i];
        const def = config.gangSeasonRewards && config.gangSeasonRewards[rewardId];
        if (!def) continue;
        seasonRewards.push({
          num: i + 1,
          id: rewardId,
          name: def.name,
          emoji: def.emoji,
          description: def.description,
          rank: def.rank
        });
      }

      const categoryKey = resolveGangArtefaktyCategory(secondArg);

      if (secondArg === 'help' || secondArg === 'info') {
        const targetNum = parseInt(args[2], 10);
        const art = regularItems.find(a => a.num === targetNum) || seasonRewards.find(a => a.num === targetNum);
        if (!art) {
          await message.reply(`❌ Nie znaleziono przedmiotu gangowego o numerze **${args[2] || ''}**.`);
          return;
        }

        const ownResult = await withData(store => {
          const user = getGangUser(store, message.author.id);
          if (!user.gangId || !store.profiles.gangs[user.gangId]) return { notInGang: true };
          const gang = store.profiles.gangs[user.gangId];
          const isRegular = regularItems.some(ri => ri.id === art.id);
          const owned = isRegular
            ? (gang.bossShopItems || []).includes(art.id)
            : (gang.seasonRewards || []).includes(art.id);
          return { notInGang: false, owned, gangName: gang.name };
        });

        let ownedLine = 'ℹ️ Nie należysz do gangu, więc nie mogę sprawdzić posiadania.';
        if (!ownResult.notInGang) {
          ownedLine = ownResult.owned
            ? `🟢 Twój gang (**${ownResult.gangName}**) posiada ten przedmiot.`
            : `🔴 Twój gang (**${ownResult.gangName}**) nie posiada tego przedmiotu.`;
        }

        const isSeason = seasonRewards.some(sr => sr.id === art.id);
        let extraInfo = '';
        if (isSeason) {
          const rankNames = { 1: '🥇 TOP 1 sezonu', 2: '🥈 TOP 2 sezonu', 3: '🥉 TOP 3 sezonu' };
          extraInfo = `• **Nagroda sezonowa:** ${rankNames[art.rank] || ''}\n`;
        } else {
          extraInfo = `• **Skrzynka:** ${art.crateEmoji} ${art.crateName}\n`;
        }

        await message.reply(
          `✨ **PRZEDMIOT GANGOWY: ${art.name.toUpperCase()}** ${art.emoji} ✨\n` +
          extraInfo +
          `• **Status:** ${ownedLine}\n\n` +
          `ℹ️ **Opis działania:**\n${art.description}`
        );
        return;
      }

      if (categoryKey && thirdArg === 'help') {
        const targetNum = parseInt(args[3], 10);
        let art = null;

        if (categoryKey === 'standardowe') {
          art = regularItems.find(a => a.num === targetNum);
        } else if (categoryKey === 'sezonowe') {
          art = seasonRewards.find(a => a.num === targetNum);
        }

        if (!art) {
          await message.reply(`❌ Nie znaleziono przedmiotu gangowego o numerze **${args[3] || ''}** w kategorii **${categoryKey}**.`);
          return;
        }

        const ownResult = await withData(store => {
          const user = getGangUser(store, message.author.id);
          if (!user.gangId || !store.profiles.gangs[user.gangId]) return { notInGang: true };
          const gang = store.profiles.gangs[user.gangId];
          const isRegular = regularItems.some(ri => ri.id === art.id);
          const owned = isRegular
            ? (gang.bossShopItems || []).includes(art.id)
            : (gang.seasonRewards || []).includes(art.id);
          return { notInGang: false, owned, gangName: gang.name };
        });

        let ownedLine = 'ℹ️ Nie należysz do gangu, więc nie mogę sprawdzić posiadania.';
        if (!ownResult.notInGang) {
          ownedLine = ownResult.owned
            ? `🟢 Twój gang (**${ownResult.gangName}**) posiada ten przedmiot.`
            : `🔴 Twój gang (**${ownResult.gangName}**) nie posiada tego przedmiotu.`;
        }

        const isSeason = seasonRewards.some(sr => sr.id === art.id);
        let extraInfo = '';
        if (isSeason) {
          const rankNames = { 1: '🥇 TOP 1 sezonu', 2: '🥈 TOP 2 sezonu', 3: '🥉 TOP 3 sezonu' };
          extraInfo = `• **Nagroda sezonowa:** ${rankNames[art.rank] || ''}\n`;
        } else {
          extraInfo = `• **Skrzynka:** ${art.crateEmoji} ${art.crateName}\n`;
        }

        await message.reply(
          `✨ **PRZEDMIOT GANGOWY: ${art.name.toUpperCase()}** ${art.emoji} ✨\n` +
          extraInfo +
          `• **Status:** ${ownedLine}\n\n` +
          `ℹ️ **Opis działania:**\n${art.description}`
        );
        return;
      }

      if (!args[1] || (secondArg && resolveGangArtefaktyCategory(secondArg))) {
        const categoryKey = args[1] ? resolveGangArtefaktyCategory(secondArg) : null;

        if (!categoryKey) {
          client.pendingGangArtefakty = client.pendingGangArtefakty || new Map();
          const senderId = message.author.id;
          const rawThreadId = message.rawEvent?.threadID || message.guild?.id;
          const threadId = rawThreadId === 'messenger' ? undefined : (rawThreadId?.replace?.('page:', '') || rawThreadId);

          const existing = client.pendingGangArtefakty.get(senderId);
          if (existing) clearTimeout(existing.timeout);

          const timeout = setTimeout(() => {
            client.pendingGangArtefakty.delete(senderId);
          }, 60000);

          client.pendingGangArtefakty.set(senderId, { timeout, threadId });

          await message.reply({ embeds: [buildGangArtefaktyCategoryPrompt()] });
          return;
        }

        if (categoryKey === 'standardowe') {
          const listResult = await withData(store => {
            const user = getGangUser(store, message.author.id);
            if (!user.gangId || !store.profiles.gangs[user.gangId]) return { notInGang: true };
            const gang = store.profiles.gangs[user.gangId];
            return {
              notInGang: false,
              gangName: gang.name,
              ownedIds: gang.bossShopItems || []
            };
          });

          if (listResult.notInGang) {
            await message.reply('❌ Nie należysz do żadnego gangu, więc nie mogę pokazać przedmiotów gangowych. Wpisz **!gang stworz <nazwa>** lub dołącz do istniejącego gangu.');
            return;
          }

          await message.reply({
            embeds: [buildGangArtefaktyCategoryList('standardowe', regularItems)]
          });
          return;
        }

        if (categoryKey === 'sezonowe') {
          const listResult = await withData(store => {
            const user = getGangUser(store, message.author.id);
            if (!user.gangId || !store.profiles.gangs[user.gangId]) return { notInGang: true };
            const gang = store.profiles.gangs[user.gangId];
            return {
              notInGang: false,
              gangName: gang.name,
              ownedIds: gang.seasonRewards || []
            };
          });

          if (listResult.notInGang) {
            await message.reply('❌ Nie należysz do żadnego gangu, więc nie mogę pokazać przedmiotów gangowych. Wpisz **!gang stworz <nazwa>** lub dołącz do istniejącego gangu.');
            return;
          }

          await message.reply({
            embeds: [buildGangArtefaktyCategoryList('sezonowe', seasonRewards)]
          });
          return;
        }
      }

      await message.reply(`❌ Nieprawidłowy argument. Użyj: **!gang artefakty** aby zobaczyć kategorie, lub **!gang artefakty <kategoria>** (standardowe/sezonowe).`);
      return;
    }

    // ==========================================
    // 10c. GANG SKLEP (BOSS SHOP)
    // ==========================================
    if (sub === 'sklep') {
      const shopFirstArg = String(args[1] || '').toLowerCase();

      if (shopFirstArg === 'help' || shopFirstArg === 'opis' || shopFirstArg === 'info') {
        const targetNum = String(args[2] || '').toLowerCase();
        if (!targetNum) {
          await message.reply(
            `ℹ️ Użyj: **!gang sklep help <numer>** aby zobaczyć szczegółowy opis.\n` +
            `💡 Numery znajdziesz w liście: **!gang sklep**`
          );
          return;
        }

        const crates = getAllCrateDefinitions();
        const targetNumInt = parseInt(targetNum, 10);
        if (targetNumInt === MERCENARIES_SHOP_NUMBER) {
          const typesLines = MERCENARY_TYPES_ORDER.map((key, idx) => {
            const def = MERCENARY_TYPES[key];
            const repReq = def.minRep ? ` (wymaga **${def.minRep} REP** gangu)` : '';
            return `${idx + 1}. ${def.name} — ${formatCurrency(def.price)}${repReq}\n   _${def.desc}_`;
          }).join('\n\n');
          await message.reply(
            `🪖 **Najemnicy — Kontrakty 24h**\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `${typesLines}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💡 Kup: **!gang sklep kup ${MERCENARIES_SHOP_NUMBER} <numer kontraktu 1-5>**`
          );
          return;
        }

        const crateId = CRATE_ORDER[targetNumInt - 1];
        if (!crateId || !crates[crateId]) {
          await message.reply(`❌ Nie znaleziono pozycji o numerze **${targetNum}**. Wpisz **!gang sklep** aby zobaczyć listę.`);
          return;
        }

        const crate = crates[crateId];
        const itemsList = Object.entries(crate.items).map(([itemId, def]) => {
          return `• ${def.emoji} **${def.name}** — ${def.chance}%\n   _${def.description}_`;
        }).join('\n');

        await message.reply(
          `${crate.emoji} **${crate.name}** — ${formatCurrency(crate.price)}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 Drop pieniędzy: ${formatCurrency(crate.moneyMin)} – ${formatCurrency(crate.moneyMax)}\n\n` +
          `🎁 **Przedmioty:**\n${itemsList}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 Kup: **!gang sklep kup ${targetNumInt} [ilość]**`
        );
        return;
      }

      const readResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = getGangUser(store, message.author.id);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';
        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą korzystać z Bossowego Sklepu.' };
        }

        const today = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
        if (gang.bossShopPurchasesDate !== today) {
          gang.bossShopPurchasesDate = today;
          gang.bossShopPurchasesToday = 0;
        }

        return {
          gangId: user.gangId,
          gangName: gang.name,
          vault: gang.vault || 0,
          purchasesToday: gang.bossShopPurchasesToday || 0,
          bossShopItems: gang.bossShopItems || []
        };
      });

      if (readResult.error) {
        await message.reply(readResult.error);
        return;
      }

      if (shopFirstArg === 'kup') {
        const targetNum = String(args[2] || '').toLowerCase();
        const targetNumInt = parseInt(targetNum, 10);

        if (targetNumInt === MERCENARIES_SHOP_NUMBER) {
          const contractNumRaw = String(args[3] || '').trim();
          const contractNumInt = parseInt(contractNumRaw, 10);
          const contractType = Number.isFinite(contractNumInt) ? MERCENARY_TYPES_ORDER[contractNumInt - 1] : null;

          if (!contractType || !MERCENARY_TYPES[contractType]) {
            const typesHelp = MERCENARY_TYPES_ORDER.map((key, idx) => `${idx + 1}. ${MERCENARY_TYPES[key].name}`).join('\n');
            await message.reply(
              `❌ Podaj numer kontraktu: **!gang sklep kup ${MERCENARIES_SHOP_NUMBER} <numer 1-5>**\n\n${typesHelp}`
            );
            return;
          }

          const contractDef = MERCENARY_TYPES[contractType];
          const isCreator = message.author.id === '100060812419294';
          const purchaseResult = await withData(store => {
            const gang = store.profiles.gangs[readResult.gangId];
            if (!gang) {
              return { error: '❌ Gang nie istnieje.' };
            }
            if (contractDef.minRep && (gang.reputation || 0) < contractDef.minRep) {
              return { error: `❌ Aby kupić **${contractDef.name}**, gang potrzebuje co najmniej **${contractDef.minRep} REP**. Obecnie: **${gang.reputation || 0} REP**.` };
            }
            if ((gang.vault || 0) < contractDef.price) {
              return { error: '❌ Brak środków w sejfie gangu. Potrzeba: **${formatCurrency(contractDef.price)}**, posiadacie: **${formatCurrency(gang.vault || 0)}**.' };
            }
            gang.vault -= contractDef.price;
            if (!Array.isArray(gang.mercenaryContracts)) {
              gang.mercenaryContracts = [];
            }
            const activeContractsBefore = gang.mercenaryContracts.filter(c => c && c.until > Date.now());
            if (!isCreator && activeContractsBefore.length >= 1) {
              return { error: '❌ Twój gang może mieć tylko 1 aktywny kontrakt najemników w danym momencie. Poczekaj na wygaśnięcie obecnego.' };
            }
            gang.mercenaryContracts.push({ type: contractType, until: Date.now() + MERCENARIES_DURATION_MS });
            const activeContracts = gang.mercenaryContracts.filter(c => c && c.until > Date.now());
            return { ok: true, type: contractType, until: Date.now() + MERCENARIES_DURATION_MS, activeCount: activeContracts.length };
          });

          if (purchaseResult.error) {
            await message.reply(purchaseResult.error);
            return;
          }

          await message.reply(
            `🪖 **Wynajęto ${contractDef.name}!**\n` +
            `💰 Koszt: **-${formatCurrency(contractDef.price)}** z sejfu gangu.\n` +
            `⚔️ Efekt na **24 godziny**: ${contractDef.desc}\n` +
            `📊 Aktywne kontrakty: **${purchaseResult.activeCount}**` +
            (isCreator && purchaseResult.activeCount > 1 ? `\n💎 **Stackowanie aktywne!** Bonusy z wielu kontraktów łączą się dla gangu twórcy.` : '')
          );
          return;
        }

        const crateId = CRATE_ORDER[targetNumInt - 1];
        if (!crateId) {
          await message.reply(`❌ Nieprawidłowy numer pozycji. Wpisz **!gang sklep** aby zobaczyć listę.`);
          return;
        }

        const crates = getAllCrateDefinitions();
        const crate = crates[crateId];
        if (!crate) {
          await message.reply(`❌ Nie znaleziono pozycji o numerze **${targetNum}**.`);
          return;
        }

        const qtyRaw = args[3] ? parseInt(args[3], 10) : 1;
        const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

        const purchaseResult = await withData(async store => {
          const gang = store.profiles.gangs[readResult.gangId];
          if (!gang) return { error: '❌ Gang nie istnieje.' };
          const result = await processBossShopPurchase(gang, crateId, quantity, store);
          if (result.error) return result;
          gang.vault = (gang.vault || 0) + result.totalMoney;
          return result;
        });

        if (purchaseResult.error) {
          await message.reply(purchaseResult.error);
          return;
        }

        const lines = [
          `🛒 **Bossowy Sklep — Zakup**`,
          `📦 Skrzynka: **${crate.emoji} ${crate.name}** x${quantity}`,
          `💰 Łączny drop pieniędzy: **+${formatCurrency(purchaseResult.totalMoney)}**`,
        ];

        if (purchaseResult.perCrateResults && purchaseResult.perCrateResults.length > 1) {
          lines.push(`\n📋 **Szczegóły każdej skrzynki:**`);
          purchaseResult.perCrateResults.forEach((crateResult, idx) => {
            const moneyLine = `   💰 #${idx + 1}: **+${formatCurrency(crateResult.money)}**`;
            const itemLine = crateResult.item
              ? `   🎁 #${idx + 1}: ${getItemEmoji(crateResult.item)} **${getItemName(crateResult.item)}**${crateResult.gained ? '' : ' (już posiadacie — pominięto)'}`
              : `   💨 #${idx + 1}: Brak przedmiotu`;
            lines.push(moneyLine);
            lines.push(itemLine);
          });
        }

        if (purchaseResult.itemsSummary) {
          lines.push(purchaseResult.itemsSummary);
        }

        if (purchaseResult.transferredZaklocasz && purchaseResult.transferredZaklocasz > 0) {
          lines.push(`📟 **Zakłócacz:** przeniesiono **${purchaseResult.transferredZaklocasz}** osobistych kopii od członków gangu do zbioru gangu.`);
        }

        lines.push(`📅 Pozostało zakupów dziś: **${purchaseResult.remainingPurchases}/10**`);

        await message.reply(lines.join('\n'));
        return;
      }

      const remaining = 10 - (readResult.purchasesToday || 0);
      const response =
        `🛒 **BOSSOWY SKLEP GANGU**\n` +
        `${renderBossShopList(readResult.bossShopItems)}\n` +
        `💰 Sejf: **${formatCurrency(readResult.vault)}** | 📅 Dzisiaj: **${readResult.purchasesToday}/10** (pozostało: **${remaining}**)\n\n` +
        `💡 Kup: **!gang sklep kup <numer> [ilość]** | Szczegóły: **!gang sklep help <numer>**`;

      await message.reply(response);
      return;
    }

    // ==========================================
    // 11. GANG INFO (DEFAULT)
    // ==========================================
    // info
    async function getName(id) {
      if (client.resolvedUserNames && client.resolvedUserNames.has(id) && client.userNames.has(id)) {
        return client.userNames.get(id);
      }

      try {
        const { loadData } = require('../utils/storage');
        const usersData = loadData('users');
        if (usersData && usersData[id] && usersData[id].name) {
          client.userNames.set(id, usersData[id].name);
          if (client.resolvedUserNames) client.resolvedUserNames.add(id);
          return usersData[id].name;
        }
      } catch (_) {}

      if (client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const info = await new Promise((resolve) => {
            client.api.getUserInfo(id, (err, ret) => {
              if (!err && ret && ret[id]) {
                const name = ret[id].name;
                client.userNames.set(id, name);
                if (client.resolvedUserNames) {
                  client.resolvedUserNames.add(id);
                }
                resolve(name);
              } else {
                resolve(null);
              }
            });
          });
          if (info) return info;
        } catch (_) {}
      }
      return client.userNames.get(id) || `Użytkownik_${String(id).slice(-6)}`;
    }

    let targetParam = null;
    if (sub === 'info') {
      targetParam = args.slice(1).join(' ').trim() || null;
    } else if (!['stworz', 'zapros', 'dolacz', 'akceptuj', 'awans', 'wyrzuc', 'opusc', 'wplac', 'wyplac', 'ulepsz', 'skok', 'haracz', 'atak', 'wojna', 'wsparcie', 'wesprzyj', 'artefakty', 'artf', 'eq', 'sklep'].includes(sub)) {
      targetParam = args.join(' ').trim() || null;
    }

    const mentioned = message.mentions.users.first();
    let targetUserId = null;
    if (mentioned) {
      targetUserId = mentioned.id;
    } else if (targetParam && /^\d+$/.test(targetParam) && targetParam.length >= 8) {
      targetUserId = targetParam;
    }

    const infoResult = await withData(store => {
      store.profiles.gangs = store.profiles.gangs || {};
      const user = getGangUser(store, message.author.id);

      let targetGangId = null;

      if (targetUserId) {
        const tgtUser = store.users[targetUserId];
        if (tgtUser && tgtUser.gangId) {
          targetGangId = tgtUser.gangId;
        }
      }

      if (!targetGangId && targetParam) {
        const cleanParam = targetParam.toLowerCase();
        if (store.profiles.gangs[cleanParam]) {
          targetGangId = cleanParam;
        } else {
          const foundGang = Object.entries(store.profiles.gangs).find(
            ([id, g]) => g.name.toLowerCase() === cleanParam
          );
          if (foundGang) {
            targetGangId = foundGang[0];
          }
        }

        if (!targetGangId && /^\d+$/.test(targetParam)) {
          const tgtUser = store.users[targetParam];
          if (tgtUser && tgtUser.gangId) {
            targetGangId = tgtUser.gangId;
          }
        }
      }

      if (!targetGangId) {
        targetGangId = user.gangId;
      }

      if (!targetGangId || !store.profiles.gangs[targetGangId]) {
        return { notInGang: true };
      }

      const gang = store.profiles.gangs[targetGangId];
      return {
        notInGang: false,
        name: gang.name,
        bossId: gang.bossId,
        deputies: gang.deputies || [],
        members: gang.members || [],
        vault: gang.vault || 0,
        levelDziupla: gang.levelDziupla || 0,
        levelBiznesy: gang.levelBiznesy || 0,
        levelFach: gang.levelFach || 0,
        levelUzbrojenie: gang.levelUzbrojenie || 0,
        levelObrona: gang.levelObrona || 0,
        tributePercent: gang.tributePercent || 0,
        deposits: gang.deposits || {},
        lastAttackTime: gang.lastAttackTime || 0,
        shieldUntil: gang.shieldUntil || 0,
        alliances: gang.alliances || [],
        reputation: gang.reputation || 0,
        lastActivityAt: gang.lastActivityAt || 0,
        mercenaryContracts: Array.isArray(gang.mercenaryContracts) ? gang.mercenaryContracts : []
      };
    });

    if (infoResult.notInGang) {
      await message.reply('❌ Nie znaleziono gangu dla podanej nazwy, osoby lub ID.');
      return;
    }

    const bossName = await getName(infoResult.bossId);
    const sortedDeputies = [...infoResult.deputies].sort((a, b) => (infoResult.deposits[b] || 0) - (infoResult.deposits[a] || 0));
    const deputyNamesList = await Promise.all(sortedDeputies.map(async id => await getName(id)));
    const deputyNames = deputyNamesList.join(', ') || 'Brak';

    // Sort members: boss first, deputies second, regular members sorted by deposits desc
    const regularMembers = infoResult.members.filter(
      id => id !== infoResult.bossId && !infoResult.deputies.includes(id)
    ).sort((a, b) => (infoResult.deposits[b] || 0) - (infoResult.deposits[a] || 0));

    const orderedMembers = [
      infoResult.bossId,
      ...sortedDeputies,
      ...regularMembers
    ].filter(id => infoResult.members.includes(id) || id === infoResult.bossId);

    const memberNamesList = await Promise.all(orderedMembers.map(async (id, idx) => {
      const roleStr = id === infoResult.bossId ? '👑 Boss' : infoResult.deputies.includes(id) ? '⭐ Zastępca' : '👤 Członek';
      const nameStr = await getName(id);
      const deposited = infoResult.deposits[id] || 0;
      return `${idx + 1}. ${nameStr} (${roleStr}) — wpłacił: ${formatCurrency(deposited)}`;
    }));
    const memberNames = memberNamesList.join('\n');

    const maxMembers = 5 + infoResult.levelDziupla;

    let bonusesStr = '';
    const bizPerc = [0, 10, 20, 30][infoResult.levelBiznesy];
    const fachPerc = [0, 4, 8, 12][infoResult.levelFach];
    const uzbrojeniePerc = [0, 4, 8, 12, 16, 24][infoResult.levelUzbrojenie || 0];
    const obronaPerc = [0, 4, 8, 12, 16, 24][infoResult.levelObrona || 0];

    const costDziupla = infoResult.levelDziupla < 10 
      ? ` — Koszt ulepszenia: **${formatCurrency(100000 + infoResult.levelDziupla * 40000)}**` 
      : ' (Maks. poziom)';
    const costBiznesy = infoResult.levelBiznesy < 3 
      ? ` — Koszt ulepszenia: **${formatCurrency([200000, 400000, 650000][infoResult.levelBiznesy])}**` 
      : ' (Maks. poziom)';
    const costFach = infoResult.levelFach < 3 
      ? ` — Koszt ulepszenia: **${formatCurrency([200000, 350000, 600000][infoResult.levelFach])}**` 
      : ' (Maks. poziom)';
    const costUzbrojenie = (infoResult.levelUzbrojenie || 0) < 5
      ? ` — Koszt ulepszenia: **${formatCurrency([500000, 1000000, 2000000, 4000000, 8000000][infoResult.levelUzbrojenie || 0])}**`
      : ' (Maks. poziom)';
    const costObrona = (infoResult.levelObrona || 0) < 5
      ? ` — Koszt ulepszenia: **${formatCurrency([500000, 1000000, 2000000, 4000000, 8000000][infoResult.levelObrona || 0])}**`
      : ' (Maks. poziom)';

    bonusesStr += `1. 📦 Dziupla (Pojemność): **${infoResult.members.length}/${maxMembers}** (Lvl ${infoResult.levelDziupla}/10)${costDziupla}\n`;
    bonusesStr += `2. 📈 Biznesy (Praca): **+${bizPerc}%** (Lvl ${infoResult.levelBiznesy}/3)${costBiznesy}\n`;
    bonusesStr += `3. 🥷 Fach (Kradzieże): **+${fachPerc}%** (Lvl ${infoResult.levelFach}/3)${costFach}\n`;
    bonusesStr += `4. ⚔️ Lepsze uzbrojenie (Atak): **+${uzbrojeniePerc}%** (Lvl ${infoResult.levelUzbrojenie}/5)${costUzbrojenie}\n`;
    bonusesStr += `5. 🛡️ Lepsza strategia obronna (Obrona): **+${obronaPerc}%** (Lvl ${infoResult.levelObrona}/5)${costObrona}`;

    let statusStr = '';
    const rep = Math.max(0, Math.floor(infoResult.reputation || 0));
    const repRank = getReputationRank(rep);
    statusStr += `⭐ Reputacja: **${rep} REP** (${repRank.name})\n`;
    const now = Date.now();
    if (infoResult.shieldUntil && now < infoResult.shieldUntil) {
      const leftSec = Math.ceil((infoResult.shieldUntil - now) / 1000);
      const hrs = Math.floor(leftSec / 3600);
      const mins = Math.floor((leftSec % 3600) / 60);
      const secs = leftSec % 60;
      const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
      statusStr += `🛡️ Tarcza ochronna: **Aktywna (${leftStr})**\n`;
    }
    const activeMercs = (infoResult.mercenaryContracts || []).filter(c => c && c.until > now);
    if (activeMercs.length > 0) {
      const mercLines = activeMercs.map(c => {
        const leftSec = Math.ceil((c.until - now) / 1000);
        const hrs = Math.floor(leftSec / 3600);
        const mins = Math.floor((leftSec % 3600) / 60);
        const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null].filter(Boolean).join(' ');
        const typeName = (MERCENARY_TYPES && MERCENARY_TYPES[c.type]) ? MERCENARY_TYPES[c.type].name : c.type;
        return `• ${typeName}: **${leftStr}**`;
      });
      statusStr += `🪖 Najemnicy:\n${mercLines.join('\n')}\n`;
    }
    const { getActiveTerritoriesForGang } = require('../utils/territories');
    const ownedTerritories = getActiveTerritoriesForGang(infoResult.id || infoResult.name);
    if (ownedTerritories.length > 0) {
      const territoryNames = ownedTerritories.map(t => `${t.emoji} ${t.name}`).join(', ');
      statusStr += `🌍 Terytoria: **${territoryNames}**\n`;
    }
    if (infoResult.lastAttackTime && now - infoResult.lastAttackTime < 12 * 60 * 60 * 1000) {
      const leftSec = Math.ceil((12 * 60 * 60 * 1000 - (now - infoResult.lastAttackTime)) / 1000);
      const hrs = Math.floor(leftSec / 3600);
      const mins = Math.floor((leftSec % 3600) / 60);
      const secs = leftSec % 60;
      const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
      statusStr += `⚔️ Gotowość do ataku: **Za ${leftStr}**\n`;
    } else {
      statusStr += `⚔️ Gotowość do ataku: **Gotowy**\n`;
    }

    const allianceNamesList = await withData(store => {
      return (infoResult.alliances || []).map(allianceId => {
        const ally = store.profiles.gangs[allianceId];
        return ally ? ally.name : null;
      }).filter(Boolean);
    });
    const alliancesStr = allianceNamesList.join(', ') || 'Brak';

    await message.reply(
      `👥 **GANG: ${infoResult.name.toUpperCase()}** 👥\n` +
      `👑 Boss: **${bossName}**\n` +
      `⭐ Zastępcy: **${deputyNames}**\n` +
      `🤝 Sojusze: **${alliancesStr}**\n` +
      `💰 Sejf gangu: **${formatCurrency(infoResult.vault)}**\n` +
      `💸 Haracz gangu: **${infoResult.tributePercent}%**\n` +
      (statusStr ? statusStr + `\n` : '') +
      `🛡️ **Ulepszenia i bonusy:**\n${bonusesStr}\n\n` +
      `👥 **Członkowie:**\n${memberNames}\n\n` +
      `💡 **Komendy gangu:**\n` +
      `• Sojusz: **!gang sojusz <nazwa|oznaczenie>**\n` +
      `• Atak: **!gang atak <cel>**\n` +
      `• Skok: **!gang skok**\n` +
      `• Sklep: **!gang sklep**\n` +
      `• Terytoria: **!terytoria**\n` +
      `• Ulepsz: **!gang ulepsz <nr>**\n` +
      `• Usuń: **!gang usun <nr>**\n` +
      `• Wyrzuć: **!gang wyrzuc <nr>**\n` +
      `• Wsparcie: **!gang wsparcie <oznaczenie>**\n` +
      `• Ranking: **!top gang**`
    );
  }
};
