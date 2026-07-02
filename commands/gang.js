const { formatCurrency, resolveAmount, ensureInventoryRecord, addItem, hasItem, getPassiveMultiplier } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

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
        const user = createUser(message.author.id, store.users);

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

        // Notify target boss
        const notifyBody = `💔 Boss gangu **${readResult.myGangName}** zerwał sojusz z Twoim gangiem **${readResult.targetGangName}**!`;
        const notifyPayload = {
          body: `${targetBossName}, ${notifyBody}`,
          mentions: [{ tag: targetBossName, id: readResult.targetBossId }]
        };
        client.api.sendMessage(notifyPayload, targetThreadId);
      } else if (writeResult.action === 'accepted') {
        await message.reply(`🤝 Sojusz z gangiem **${readResult.targetGangName}** został zawarty!`);

        // Notify target boss only if they are on a different group
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

        // Notify target boss
        const notifyBody = `🔔 Boss gangu **${readResult.myGangName}** (${myBossName}) chce zawrzeć sojusz z Twoim gangiem **${readResult.targetGangName}**!\n\n💡 Aby zaakceptować propozycję, wpisz na czacie: **!gang sojusz ${readResult.myGangName}**`;
        const notifyPayload = {
          body: `${targetBossName}, ${notifyBody}`,
          mentions: [{ tag: targetBossName, id: readResult.targetBossId }]
        };
        client.api.sendMessage(notifyPayload, targetThreadId);
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

        const user = createUser(message.author.id, store.users);
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

        store.profiles.gangs[gangId] = {
          name: gangName,
          bossId: message.author.id,
          deputies: [],
          members: [message.author.id],
          vault: 0,
          levelDziupla: 0,
          levelBiznesy: 0,
          levelFach: 0,
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
        const user = createUser(message.author.id, store.users);

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

        const user = createUser(message.author.id, store.users);
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
        const user = createUser(message.author.id, store.users);

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
    // 5. WYRZUC
    // ==========================================
    if (sub === 'wyrzuc') {
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
        await message.reply('❌ Użyj: **!gang wyrzuc @osoba** lub **!gang wyrzuc <ID>**');
        return;
      }

      if (targetId === message.author.id) {
        await message.reply('❌ Nie możesz wyrzucić samego siebie. Jeśli chcesz odejść, użyj **!gang opusc**.');
        return;
      }

      const kickResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = createUser(message.author.id, store.users);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
        }

        const gang = store.profiles.gangs[user.gangId];
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';

        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą wyrzucać członków.' };
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

      await message.reply(`👞 Wyrzucono **${targetName}** z gangu **${kickResult.gangName}**.`);
      return;
    }

    // ==========================================
    // 6. OPUSC
    // ==========================================
    if (sub === 'opusc') {
      const leaveResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = createUser(message.author.id, store.users);

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
        const user = createUser(message.author.id, store.users);

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
        gangObj.vault += amount;
        gangObj.deposits = gangObj.deposits || {};
        gangObj.deposits[message.author.id] = (gangObj.deposits[message.author.id] || 0) + amount;

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
        const user = createUser(message.author.id, store.users);

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
        const isBoss = user.gangRole === 'boss';
        const isDeputy = user.gangRole === 'deputy';

        if (!isBoss && !isDeputy) {
          return { error: '❌ Tylko Boss oraz Zastępcy mogą wypłacać monety z sejfu gangu.' };
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
        const user = createUser(message.author.id, store.users);

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

      if (!['dziupla', 'biznesy', 'fach'].includes(targetUpgrade)) {
        // Fetch current levels to show upgrade costs
        const levels = await withData(store => {
          const user = createUser(message.author.id, store.users);
          if (user.gangId && store.profiles.gangs && store.profiles.gangs[user.gangId]) {
            const gang = store.profiles.gangs[user.gangId];
            return {
              levelDziupla: gang.levelDziupla || 0,
              levelBiznesy: gang.levelBiznesy || 0,
              levelFach: gang.levelFach || 0
            };
          }
          return null;
        });

        let costsMsg = '';
        if (levels) {
          const costDziupla = levels.levelDziupla < 10 ? formatCurrency(100000 + levels.levelDziupla * 40000) : 'Maksymalny poziom';
          const costBiznesy = levels.levelBiznesy < 3 ? formatCurrency([200000, 400000, 650000][levels.levelBiznesy]) : 'Maksymalny poziom';
          const costFach = levels.levelFach < 3 ? formatCurrency([200000, 350000, 600000][levels.levelFach]) : 'Maksymalny poziom';

          costsMsg = `\n\n🛠️ **Koszt kolejnych ulepszeń dla Twojego gangu:**\n` +
                     `• 📦 **Dziupla** (Lvl ${levels.levelDziupla} -> ${levels.levelDziupla + 1}): **${costDziupla}**\n` +
                     `• 📈 **Legalne Biznesy** (Lvl ${levels.levelBiznesy} -> ${levels.levelBiznesy + 1}): **${costBiznesy}**\n` +
                     `• 🥷 **Złodziejski Fach** (Lvl ${levels.levelFach} -> ${levels.levelFach + 1}): **${costFach}**`;
        } else {
          costsMsg = `\n\n🛠️ **Cennik ulepszeń gangów:**\n` +
                     `• 📦 **Dziupla**: **100 000 💰** (każdy kolejny poziom +40 000 💰)\n` +
                     `• 📈 **Legalne Biznesy**: Lvl 1: **200 000 💰** | Lvl 2: **400 000 💰** | Lvl 3: **650 000 💰**\n` +
                     `• 🥷 **Złodziejski Fach**: Lvl 1: **200 000 💰** | Lvl 2: **350 000 💰** | Lvl 3: **600 000 💰**`;
        }

        await message.reply(`❌ Użyj: **!gang ulepsz <dziupla/biznesy/fach>** lub **!gang ulepsz <1/2/3>**${costsMsg}`);
        return;
      }

      const upgradeResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = createUser(message.author.id, store.users);

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
        }

        if (gang.vault < cost) {
          return { error: `❌ Ulepszenie kosztuje ${formatCurrency(cost)} z sejfu gangu. Posiadacie: ${formatCurrency(gang.vault)}.` };
        }

        gang.vault -= cost;
        if (targetUpgrade === 'dziupla') gang.levelDziupla = newLevel;
        else if (targetUpgrade === 'biznesy') gang.levelBiznesy = newLevel;
        else if (targetUpgrade === 'fach') gang.levelFach = newLevel;

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
        const user = createUser(message.author.id, store.users);

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
          console.log(`[GANG WSPIERANIE] Dodano wsparcie: ${supportResult.myGangId} <- ${supportResult.targetGangId}`);
          console.log(`[GANG WSPIERANIE] supportedGangs:`, heist.supportedGangs);
        }
      }

      // Nie ustawiamy lastSupportTime tutaj - tylko gdy ktoś faktycznie dołączy do skoku

      // Wyślij powiadomienie do grupy sojuszniczego gangu
      try {
        const notifyMsg = `🤝 **WSPIERANIE SKOKU GANGU** 🤝\n\n` +
          `Gang **${supportResult.myGangName}** prosi o wsparcie w skoku!\n` +
          `📊 Obecnie zapisanych uczestników: **${supportResult.participantsCount}**\n\n` +
          `👥 Członkowie gangu **${supportResult.targetGangName}** mogą dołączyć do skoku wpisem:\n` +
          `**!gang skok dolacz** (lub **!gang skok d**)\n\n` +
          `⚠️ *Wymagane minimum 100 komend. Więcej uczestników = większy łup!*`;

        client.api.sendMessage(notifyMsg, supportResult.bestThread);
        await message.reply(`✅ Wysłano prośbę o wsparcie do gangu **${supportResult.targetGangName}**! Powiadomienie wysłano na grupę z **${supportResult.maxMemberCount}** członkami tego gangu.`);
      } catch (err) {
        console.error('[GANG WSPIERANIE] Błąd wysyłania powiadomienia:', err);
        await message.reply(`⚠️ Wysłano prośbę o wsparcie, ale wystąpił błąd podczas wysyłania powiadomienia do gangu **${supportResult.targetGangName}**.`);
      }
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
          const user = createUser(message.author.id, store.users);

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
          let activeHeist = client.gangHeists.get(user.gangId);
          let heistGangId = user.gangId;
          let heistGangName = store.profiles.gangs[user.gangId].name;

          // Jeśli nie, sprawdź czy któryś sojuszniczy gang ma aktywny skok z wsparciem
          if (!activeHeist) {
            const myGang = store.profiles.gangs[user.gangId];
            const alliances = myGang.alliances || [];
            
            for (const allianceGangId of alliances) {
              const allianceHeist = client.gangHeists.get(allianceGangId);
              if (allianceHeist && allianceHeist.supportedGangs && allianceHeist.supportedGangs.includes(user.gangId)) {
                activeHeist = allianceHeist;
                heistGangId = allianceGangId;
                heistGangName = store.profiles.gangs[allianceGangId].name;
                console.log(`[GANG SKOK] Użytkownik ${user.gangId} dołącza do skoku sojuszniczego gangu ${allianceGangId}`);
                break;
              }
            }
          }

          if (!activeHeist) {
            return { error: '❌ Twój gang ani żaden sojuszniczy gang nie prowadzi obecnie przygotowań do skoku z wsparciem. Boss lub Zastępca musi wpisać **!gang skok**.' };
          }

          if (activeHeist.participants.has(message.author.id)) {
            return { error: '❌ Już bierzesz udział w tym skoku.' };
          }

          activeHeist.participants.add(message.author.id);
          return { success: true, count: activeHeist.participants.size, gangName: heistGangName, isAlly: heistGangId !== user.gangId, userGangId: user.gangId, heistGangId: heistGangId };
        });

        if (getJoinRes.error) {
          await message.reply(getJoinRes.error);
          return;
        }

        // Jeśli dołączasz jako wsparcie sojuszniczego gangu, ustaw lastSupportTime
        if (getJoinRes.isAlly) {
          await withData(store => {
            if (store.profiles.gangs[getJoinRes.userGangId]) {
              store.profiles.gangs[getJoinRes.userGangId].lastSupportTime = Date.now();
              console.log(`[GANG SKOK] Ustawiono lastSupportTime dla gangu ${getJoinRes.userGangId} (dołączył jako wsparcie)`);
            }
          });
        }

        const allyText = getJoinRes.isAlly ? ` (wsparcie dla gangu **${getJoinRes.gangName}**)` : '';
        await message.reply(`🚗 Dołączyłeś do przygotowań${allyText}! Obecnie zapisanych graczy: **${getJoinRes.count}**.`);
        return;
      }

      // INICJACJA SKOKU
      const startResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = createUser(message.author.id, store.users);

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

        // Sprawdź cooldown 1h
        const lastTime = gang.lastHeistTime || 0;
        const now = Date.now();
        if (now - lastTime < 3600000) {
          const diffSec = Math.ceil((3600000 - (now - lastTime)) / 1000);
          const hrs = Math.floor(diffSec / 3600);
          const mins = Math.floor((diffSec % 3600) / 60);
          const secs = diffSec % 60;
          const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
          return { error: `⏱️ Twój gang może zaplanować kolejny skok za: **${leftStr}**.` };
        }

        if (client.gangHeists.has(user.gangId)) {
          return { error: '❌ Przygotowania do skoku już trwają!' };
        }

        return { success: true, gangId: user.gangId, gangName: gang.name, members: gang.members || [] };
      });

      if (startResult.error) {
        await message.reply(startResult.error);
        return;
      }

      // Rozpocznij fazę zapisu
      client.gangHeists.set(startResult.gangId, {
        initiatorId: message.author.id,
        participants: new Set([message.author.id]),
        endTime: Date.now() + 120000
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
      const msgPayload = {
        body: `👥 **GANG HEIST (Skok Gangu)** 👥\n` +
          `**${message.author.username || 'Boss'}** zaplanował napad gangu **${startResult.gangName}**!\n\n` +
          `🚗 Wszyscy członkowie gangu mają **2 minuty**, aby dołączyć do akcji!\n` +
          `Członkowie: ${tagsString}\n\n` +
          `Wpisz: **!gang skok dolacz** (lub **!gang skok d**), aby wziąć udział.\n\n` +
          `⚠️ *Wymagane minimum 2 osoby (każdy min. 100 komend). Szansa na powodzenie: 50%. Wielkość łupu zależy od liczby uczestników (stacja paliw: 50k-150k, jubiler: 150k-300k, posiadłość: 300k-500k, bank: 500k-800k).*`,
        mentions: memberTags
      };

      if (client.api && threadId) {
        client.api.sendMessage(msgPayload, threadId);
      } else {
        await message.reply(msgPayload.body);
      }

      // Timer na wykonanie skoku po 2 minutach
      setTimeout(async () => {
        const heist = client.gangHeists.get(startResult.gangId);
        if (!heist) return;

        client.gangHeists.delete(startResult.gangId);

        const listParticipants = Array.from(heist.participants);
        if (listParticipants.length < 2) {
          await message.reply(`❌ Skok gangu **${startResult.gangName}** został odwołany – zgłosiło się za mało uczestników (wymagane min. 2 osoby, zgłosiło się: ${listParticipants.length}).`);
          return;
        }

        const heistOutcome = await withData(store => {
          store.profiles.gangs = store.profiles.gangs || {};
          const currentGang = store.profiles.gangs[startResult.gangId];
          if (!currentGang) return { cancelled: true };

          currentGang.lastHeistTime = Date.now();

          // Calculate success chance: base 50% + gang role bonuses (boss/deputy)
          let successChance = 0.50;
          for (const pid of listParticipants) {
            const pUser = createUser(pid, store.users);
            if (pUser.gangRole === 'boss') {
              successChance = Math.max(successChance, 0.55);
            } else if (pUser.gangRole === 'deputy') {
              successChance = Math.max(successChance, 0.525);
            }
          }

          const heistSuccess = Math.random() < successChance;

          if (!heistSuccess) {
            return { success: false };
          }

          // Wygrana w przedziale zależnym od liczby uczestników
          const count = listParticipants.length;
          let minReward = 60000;
          let maxReward = 400000;
          let heistType = 'Napad';

          if (count >= 2 && count <= 3) {
            heistType = 'Napad na stację paliw';
            minReward = 50000;
            maxReward = 150000;
          } else if (count >= 4 && count <= 6) {
            heistType = 'Napad na jubilera';
            minReward = 150000;
            maxReward = 300000;
          } else if (count >= 7 && count <= 10) {
            heistType = 'Napad na posiadłość';
            minReward = 300000;
            maxReward = 500000;
          } else if (count >= 11) {
            heistType = 'Napad na bank';
            minReward = 500000;
            maxReward = 800000;
          }

          const totalReward = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;
          const rewardPerPerson = Math.floor(totalReward / listParticipants.length);

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
            finalReward += godloBonus + insygniaBonus;
            pUser.balance += finalReward;
            
            participantBonuses[pid] = godloBonus;
            participantInsygnia[pid] = insygniaBonus;
          }
          // Dodaj haracza do sejfu gangu
          currentGang.vault += totalTribute;

          return {
            success: true,
            heistType,
            totalReward,
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

          await message.reply(`💰 **SKOK GANGU ZAKOŃCZONY SUKCESEM!** 💰\n` +
            `Ekipa w składzie: **${names}** przeprowadziła pomyślnie: **${heistOutcome.heistType}**!\n\n` +
            `💵 Całkowity łup: **${formatCurrency(heistOutcome.totalReward)}**\n` +
            `💸 Każdy z uczestników otrzymuje: **+${formatCurrency(finalRewardPerPerson)}**${tributeText}${bonusText}`);
        } else {
          await message.reply(`🚨 **SKOK ZAKOŃCZYŁ SIĘ WPADKĄ!** 🚨\n` +
            `Ekipa w składzie: **${names}** została osaczona przez policję.\n\n` +
            `💥 Akcja spaliła na panewce. Nikt nic nie zarobił, a krupier nałożył 1h cooldownu na kolejne skoki.`);
        }
      }, 120000).unref();

      return;
    }

    // ==========================================
    // 10. GANG WAR / ATTACK (!gang atak / !gang wojna)
    // ==========================================
    if (sub === 'atak' || sub === 'wojna') {
      if (!client.activeGangWars) {
        client.activeGangWars = new Map();
      }

      const action = String(args[1] || '').toLowerCase();

      if (action === 'dolacz' || action === 'd') {
        const joinResult = await withData(store => {
          store.profiles.gangs = store.profiles.gangs || {};
          const user = createUser(message.author.id, store.users);

          if (!user.gangId || !store.profiles.gangs[user.gangId]) {
            return { error: '❌ Nie należysz do żadnego gangu.' };
          }

          const myGangId = user.gangId;

          // Find if there is an active war involving this gang
          let foundWar = null;
          let foundAttackerId = null;
          let isAttackingSide = false;

          for (const [attId, war] of client.activeGangWars.entries()) {
            if (attId === myGangId) {
              foundWar = war;
              foundAttackerId = attId;
              isAttackingSide = true;
              break;
            } else if (war.defenderGangId === myGangId) {
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
            return { success: true, side: 'atakujących', count: foundWar.attackers.size };
          } else {
            if (foundWar.defenders.has(message.author.id)) {
              return { error: '❌ Już dołączyłeś do obrony swojego gangu.' };
            }
            foundWar.defenders.add(message.author.id);
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
        await message.reply('❌ Użyj: **!gang atak @osoba** lub **!gang atak <ID>** lub **!gang atak dolacz**');
        return;
      }

      const startResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = createUser(message.author.id, store.users);

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

        // Resolve target user
        let targetId = null;
        const mentioned = message.mentions.users.first();
        if (mentioned) {
          targetId = mentioned.id;
        } else if (/^\d+$/.test(targetParam) && targetParam.length >= 8) {
          targetId = targetParam;
        }

        if (!targetId) {
          return { error: '❌ Musisz oznaczyć osobę (@osoba) lub podać jej ID, aby zaatakować jej gang.' };
        }

        const targetUser = store.users[targetId];
        if (!targetUser || !targetUser.gangId) {
          return { error: '❌ Ta osoba nie należy do żadnego gangu.' };
        }

        const targetGangId = targetUser.gangId;

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
        const cooldown = 24 * 60 * 60 * 1000;
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

        // Active defender's shield immediately upon initiation
        defenderGang.shieldUntil = now + 6 * 60 * 60 * 1000;

        return {
          success: true,
          attackerGangId: myGangId,
          attackerGangName: myGang.name,
          defenderGangId: targetGangId,
          defenderGangName: defenderGang.name,
          cost,
          defenderVault: defenderGang.vault || 0,
          attackerMembers: myGang.members || [],
          defenderMembers: defenderGang.members || []
        };
      });

      if (startResult.error) {
        await message.reply(startResult.error);
        return;
      }

      // Initialize the war
      client.activeGangWars.set(startResult.attackerGangId, {
        initiatorId: message.author.id,
        defenderGangId: startResult.defenderGangId,
        attackers: new Set([message.author.id]),
        defenders: new Set(),
        endTime: Date.now() + 120000
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
      const msgPayload = {
        body: `⚔️ **WOJNA GANGÓW: NAPAD NA SEJF!** ⚔️\n` +
          `**${message.author.username || 'Boss'}** (Zastępca/Boss gangu **${startResult.attackerGangName}**) wypowiedział wojnę gangowi **${startResult.defenderGangName}**!\n\n` +
          `💸 Koszt przygotowania ataku: **-${formatCurrency(startResult.cost)}** z sejfu gangu.\n` +
          `🎯 Cel: Kradzież od **15% do 35%** wrogiego sejfu (obecnie: **${formatCurrency(startResult.defenderVault)}**).\n\n` +
          `⚔️ **Atakujący (${startResult.attackerGangName}):** ${attackerTagsString}\n` +
          `🛡️ **Obrońcy (${startResult.defenderGangName}):** ${defenderTagsString}\n\n` +
          `🚗 Członkowie obu gangów mają **2 minuty**, aby dołączyć do walki!\n` +
          `Wpisz: **!gang atak dolacz**, aby wesprzeć swój gang!`,
        mentions: [...attackerMentions, ...defenderMentions]
      };

      if (client.api && threadIdVal) {
        client.api.sendMessage(msgPayload, threadIdVal);
      } else {
        await message.reply(msgPayload.body);
      }

      // Timer to resolve the war after 2 minutes
      setTimeout(async () => {
        const war = client.activeGangWars.get(startResult.attackerGangId);
        if (!war) return;

        client.activeGangWars.delete(startResult.attackerGangId);

        const listAttackers = Array.from(war.attackers);
        const listDefenders = Array.from(war.defenders);

        const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        // Resolve outcome inside withData
        const outcome = await withData(store => {
          store.profiles.gangs = store.profiles.gangs || {};
          const attackerGang = store.profiles.gangs[startResult.attackerGangId];
          const defenderGang = store.profiles.gangs[startResult.defenderGangId];

          if (!attackerGang || !defenderGang) {
            return { cancelled: true };
          }

          // Calculate Attack Power
          let baseAttackPower = 0;
          for (let i = 0; i < listAttackers.length; i++) {
            baseAttackPower += randomInt(10, 50);
          }
          const attFachLvl = attackerGang.levelFach || 0;
          const attackPower = Math.floor(baseAttackPower * (1 + 0.15 * attFachLvl));

          // Calculate Defense Power
          let baseDefensePower = 0;
          if (listDefenders.length > 0) {
            for (let i = 0; i < listDefenders.length; i++) {
              baseDefensePower += randomInt(10, 50);
            }
          }
          const defFachLvl = defenderGang.levelFach || 0;
          const defensePower = listDefenders.length > 0 ? Math.floor(baseDefensePower * (1 + 0.15 * defFachLvl)) : 0;

          // Determine Success
          let winChance = 0.95;
          if (defensePower > 0) {
            winChance = attackPower / (attackPower + defensePower);
          }
          const success = Math.random() < winChance;

          if (success) {
            // Success Loot: 15% to 35% of defender's vault
            const pct = randomInt(15, 35) / 100;
            const stolenTotal = Math.floor(defenderGang.vault * pct);
            
            defenderGang.vault = Math.max(0, defenderGang.vault - stolenTotal);
            
            const vaultShare = Math.floor(stolenTotal * 0.30);
            const membersTotalShare = stolenTotal - vaultShare;
            const sharePerPerson = Math.floor(membersTotalShare / listAttackers.length);

            attackerGang.vault += vaultShare;

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
              
              finalShare += godloBonus + insygniaBonus;
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
              attackerBonuses
            };
          } else {
            // Failure Penalty:
            // 20% to defender's vault
            // 15% divided equally among defending players' wallets
            const penaltyVault = Math.floor(attackerGang.vault * 0.20);
            const penaltyDefenders = Math.floor(attackerGang.vault * 0.15);
            const totalPenalty = penaltyVault + penaltyDefenders;

            attackerGang.vault = Math.max(0, attackerGang.vault - totalPenalty);
            defenderGang.vault += penaltyVault;

            let sharePerDefender = 0;
            const defenderBonuses = {};
            if (listDefenders.length > 0) {
              sharePerDefender = Math.floor(penaltyDefenders / listDefenders.length);
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
                
                finalShare += godloBonus + insygniaBonus;
                pUser.balance += finalShare;
                defenderBonuses[pid] = { godlo: godloBonus, insygnia: insygniaBonus };
              }
            } else {
              // If there were no defending players checked in, the 15% goes to defender's vault
              defenderGang.vault += penaltyDefenders;
            }

            return {
              success: false,
              attackPower,
              defensePower,
              penaltyVault,
              penaltyDefenders,
              sharePerDefender,
              totalPenalty,
              defenderBonuses
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

          await message.reply(
            `⚔️ **WOJNA GANGÓW ZAKOŃCZONA SUKCESEM!** ⚔️\n` +
            `Gang **${startResult.attackerGangName}** zniszczył obronę gangu **${startResult.defenderGangName}**!\n\n` +
            `🪓 Siła ataku: **${outcome.attackPower}** vs 🛡️ Siła obrony: **${outcome.defensePower}**\n\n` +
            `💰 **ŁUP WOJENNY:**\n` +
            `• Skradziono z wrogiego sejfu: **${formatCurrency(outcome.stolenTotal)}**\n` +
            `• Trafiło do sejfu Waszego gangu (30%): **+${formatCurrency(outcome.vaultShare)}**\n` +
            `• Każdy uczestnik ataku (**${attackerNames}**) otrzymuje (70%): **+${formatCurrency(outcome.sharePerPerson)}** do portfela!${zetonNote}${godloNote}`
          );
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

          const defenderDistribution = listDefenders.length > 0 
            ? `Każdy obrońca (**${defenderNames}**) otrzymuje: **+${formatCurrency(outcome.sharePerDefender)}** do portfela!`
            : `Ponieważ nikt nie bronił gangu osobiście, całe **${formatCurrency(outcome.totalPenalty)}** zasiliło sejf broniących!`;

          await message.reply(
            `🛡️ **ATAK ODPARTY! OBRONA GÓRĄ!** 🛡️\n` +
            `Gang **${startResult.defenderGangName}** skutecznie obronił swój skarbiec przed gangiem **${startResult.attackerGangName}**!\n\n` +
            `🪓 Siła ataku: **${outcome.attackPower}** vs 🛡️ Siła obrony: **${outcome.defensePower}**\n\n` +
            `💸 **KONSEKWENCJE PORAŻKI:**\n` +
            `• Gang szturmujący traci łącznie **${formatCurrency(outcome.totalPenalty)}** ze swojego sejfu!\n` +
            `• Sejf obrońców zyskuje: **+${formatCurrency(outcome.penaltyVault)}**\n` +
            `• ${defenderDistribution}${godloNote}`
          );
        }
      }, 120000).unref();

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
    } else if (!['stworz', 'zapros', 'dolacz', 'akceptuj', 'awans', 'wyrzuc', 'opusc', 'wplac', 'wyplac', 'ulepsz', 'skok', 'haracz', 'atak', 'wojna', 'wsparcie'].includes(sub)) {
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
      const user = createUser(message.author.id, store.users);

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
        tributePercent: gang.tributePercent || 0,
        deposits: gang.deposits || {},
        lastAttackTime: gang.lastAttackTime || 0,
        shieldUntil: gang.shieldUntil || 0,
        alliances: gang.alliances || []
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

    const memberNamesList = await Promise.all(orderedMembers.map(async id => {
      const roleStr = id === infoResult.bossId ? '👑 Boss' : infoResult.deputies.includes(id) ? '⭐ Zastępca' : '👤 Członek';
      const nameStr = await getName(id);
      const deposited = infoResult.deposits[id] || 0;
      return `• ${nameStr} (${roleStr}) — wpłacił: ${formatCurrency(deposited)}`;
    }));
    const memberNames = memberNamesList.join('\n');

    const maxMembers = 5 + infoResult.levelDziupla;

    let bonusesStr = '';
    const bizPerc = [0, 10, 20, 30][infoResult.levelBiznesy];
    const fachPerc = [0, 4, 8, 12][infoResult.levelFach];

    const costDziupla = infoResult.levelDziupla < 10 
      ? ` — Koszt ulepszenia: **${formatCurrency(100000 + infoResult.levelDziupla * 40000)}**` 
      : ' (Maks. poziom)';
    const costBiznesy = infoResult.levelBiznesy < 3 
      ? ` — Koszt ulepszenia: **${formatCurrency([200000, 400000, 650000][infoResult.levelBiznesy])}**` 
      : ' (Maks. poziom)';
    const costFach = infoResult.levelFach < 3 
      ? ` — Koszt ulepszenia: **${formatCurrency([200000, 350000, 600000][infoResult.levelFach])}**` 
      : ' (Maks. poziom)';

    bonusesStr += `1. 📦 Dziupla (Pojemność): **${infoResult.members.length}/${maxMembers}** (Lvl ${infoResult.levelDziupla}/10)${costDziupla}\n`;
    bonusesStr += `2. 📈 Biznesy (Praca): **+${bizPerc}%** (Lvl ${infoResult.levelBiznesy}/3)${costBiznesy}\n`;
    bonusesStr += `3. 🥷 Fach (Kradzieże): **+${fachPerc}%** (Lvl ${infoResult.levelFach}/3)${costFach}`;

    let statusStr = '';
    const now = Date.now();
    if (infoResult.shieldUntil && now < infoResult.shieldUntil) {
      const leftSec = Math.ceil((infoResult.shieldUntil - now) / 1000);
      const hrs = Math.floor(leftSec / 3600);
      const mins = Math.floor((leftSec % 3600) / 60);
      const secs = leftSec % 60;
      const leftStr = [hrs ? `${hrs}h` : null, mins ? `${mins}m` : null, `${secs}s`].filter(Boolean).join(' ');
      statusStr += `🛡️ Tarcza ochronna: **Aktywna (${leftStr})**\n`;
    }
    if (infoResult.lastAttackTime && now - infoResult.lastAttackTime < 24 * 60 * 60 * 1000) {
      const leftSec = Math.ceil((24 * 60 * 60 * 1000 - (now - infoResult.lastAttackTime)) / 1000);
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
      `👥 **Członkowie:**\n${memberNames}`
    );
  }
};
