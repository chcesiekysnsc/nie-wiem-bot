const { formatCurrency, resolveAmount } = require('../utils/economy');
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
    // 1. STWORZ
    // ==========================================
    if (sub === 'stworz') {
      const gangName = args.slice(1).join(' ').trim();
      if (!gangName || gangName.length < 3 || gangName.length > 20) {
        await message.reply('❌ Użyj: `!gang stworz <Nazwa>` (od 3 do 20 znaków).');
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
          lastHeistTime: 0
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
        await message.reply('❌ Użyj: `!gang zapros @osoba` lub `!gang zapros <ID>`');
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

      await message.reply(`✉️ Wysłałeś zaproszenie do gangu **${inviteResult.gangName}** dla **${targetName}**! Ważne przez 2 minuty. Zaproszony musi wpisać \`!gang dolacz\` lub \`!gang akceptuj\`.`);
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
        await message.reply('❌ Użyj: `!gang awans @osoba` lub `!gang awans <ID>` (może użyć też skrótu `!awans @osoba`).');
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
        await message.reply('❌ Użyj: `!gang wyrzuc @osoba` lub `!gang wyrzuc <ID>`');
        return;
      }

      if (targetId === message.author.id) {
        await message.reply('❌ Nie możesz wyrzucić samego siebie. Jeśli chcesz odejść, użyj `!gang opusc`.');
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
        await message.reply('❌ Użyj: `!gang wplac <kwota/all>`');
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
        await message.reply('❌ Użyj: `!gang wyplac <kwota/all>`');
        return;
      }

      const withdrawResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = createUser(message.author.id, store.users);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
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

        gang.vault -= amount;
        user.balance += amount;

        return { success: true, amount, gangName: gang.name };
      });

      if (withdrawResult.error) {
        await message.reply(withdrawResult.error);
        return;
      }

      await message.reply(`📤 Wypłaciłeś **${formatCurrency(withdrawResult.amount)}** z sejfu gangu **${withdrawResult.gangName}** do swojego portfela.`);
      return;
    }

    // ==========================================
    // 9. ULEPSZ
    // ==========================================
    if (sub === 'ulepsz') {
      const targetUpgrade = String(args[1] || '').toLowerCase();
      if (!['dziupla', 'biznesy', 'fach'].includes(targetUpgrade)) {
        await message.reply('❌ Użyj: `!gang ulepsz <dziupla/biznesy/fach>`');
        return;
      }

      const upgradeResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = createUser(message.author.id, store.users);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
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
          const bonuses = ['+2%', '+4%', '+5%'];
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
    // 10. SKOK / SKOK DOLACZ
    // ==========================================
    if (sub === 'skok') {
      const option = String(args[1] || '').toLowerCase();

      // DOLACZENIE DO AKTYWNEGO SKOKU
      if (option === 'dolacz' || option === 'd') {
        const getJoinRes = await withData(store => {
          store.profiles.gangs = store.profiles.gangs || {};
          const user = createUser(message.author.id, store.users);

          if (!user.gangId || !store.profiles.gangs[user.gangId]) {
            return { error: '❌ Nie należysz do żadnego gangu.' };
          }

          const activeHeist = client.gangHeists.get(user.gangId);
          if (!activeHeist) {
            return { error: '❌ Twój gang nie prowadzi obecnie przygotowań do skoku. Boss lub Zastępca musi wpisać `!gang skok`.' };
          }

          if (activeHeist.participants.has(message.author.id)) {
            return { error: '❌ Już bierzesz udział w tym skoku.' };
          }

          activeHeist.participants.add(message.author.id);
          return { success: true, count: activeHeist.participants.size, gangName: store.profiles.gangs[user.gangId].name };
        });

        if (getJoinRes.error) {
          await message.reply(getJoinRes.error);
          return;
        }

        await message.reply(`🚗 Dołączyłeś do przygotowań! Obecnie zapisanych graczy: **${getJoinRes.count}**.`);
        return;
      }

      // INICJACJA SKOKU
      const startResult = await withData(store => {
        store.profiles.gangs = store.profiles.gangs || {};
        const user = createUser(message.author.id, store.users);

        if (!user.gangId || !store.profiles.gangs[user.gangId]) {
          return { error: '❌ Nie należysz do żadnego gangu.' };
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

        return { success: true, gangId: user.gangId, gangName: gang.name };
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

      await message.reply(`👥 **GANG HEIST (Skok Gangu)** 👥\n` +
        `**${message.author.username || 'Boss'}** zaplanował napad gangu **${startResult.gangName}**!\n\n` +
        `🚗 Wszyscy członkowie gangu mają **2 minuty**, aby dołączyć do akcji!\n` +
        `Wpisz: \`!gang skok dolacz\` (lub \`!gang skok d\`), aby wziąć udział.\n\n` +
        `⚠️ *Wymagane minimum 2 osoby. Szansa na powodzenie: 50%. Łup: 60k - 400k dzielony po równo.*`);

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

        const heistSuccess = Math.random() < 0.50; // Zawsze 50% na powodzenie

        const heistOutcome = await withData(store => {
          store.profiles.gangs = store.profiles.gangs || {};
          const currentGang = store.profiles.gangs[startResult.gangId];
          if (!currentGang) return { cancelled: true };

          currentGang.lastHeistTime = Date.now();

          if (!heistSuccess) {
            return { success: false };
          }

          // Wygrana w przedziale 60 000 do 400 000
          const minReward = 60000;
          const maxReward = 400000;
          const totalReward = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;
          const rewardPerPerson = Math.floor(totalReward / listParticipants.length);

          // Rozdaj pieniądze każdemu uczestnikowi
          for (const pid of listParticipants) {
            const pUser = createUser(pid, store.users);
            pUser.balance += rewardPerPerson;
          }

          return {
            success: true,
            totalReward,
            rewardPerPerson
          };
        });

        if (heistOutcome.cancelled) return;

        // Buduj listę nicków
        const names = listParticipants.map(pid => {
          return client.userNames.get(pid) || `Gracz_${pid.slice(-6)}`;
        }).join(', ');

        if (heistOutcome.success) {
          await message.reply(`💰 **SKOK GANGU ZAKOŃCZONY SUKCESEM!** 💰\n` +
            `Ekipa w składzie: **${names}** obrobiła bank!\n\n` +
            `💵 Całkowity łup: **${formatCurrency(heistOutcome.totalReward)}**\n` +
            `💸 Każdy z uczestników otrzymuje: **+${formatCurrency(heistOutcome.rewardPerPerson)}**!`);
        } else {
          await message.reply(`🚨 **SKOK ZAKOŃCZYŁ SIĘ WPADKĄ!** 🚨\n` +
            `Ekipa w składzie: **${names}** została osaczona przez policję.\n\n` +
            `💥 Akcja spaliła na panewce. Nikt nic nie zarobił, a krupier nałożył 1h cooldownu na kolejne skoki.`);
        }
      }, 120000).unref();

      return;
    }

    // ==========================================
    // 11. GANG INFO (DEFAULT)
    // ==========================================
    // info
    async function getName(id) {
      if (client.userNames.has(id)) {
        return client.userNames.get(id);
      }
      if (client.api && typeof client.api.getUserInfo === 'function') {
        try {
          const info = await new Promise((resolve) => {
            client.api.getUserInfo(id, (err, ret) => {
              if (!err && ret && ret[id]) {
                const name = ret[id].name;
                client.userNames.set(id, name);
                resolve(name);
              } else {
                resolve(null);
              }
            });
          });
          if (info) return info;
        } catch (_) {}
      }
      return `Użytkownik_${String(id).slice(-6)}`;
    }

    let targetParam = null;
    if (sub === 'info') {
      targetParam = args.slice(1).join(' ').trim() || null;
    } else if (!['stworz', 'zapros', 'dolacz', 'akceptuj', 'awans', 'wyrzuc', 'opusc', 'wplac', 'wyplac', 'ulepsz', 'skok'].includes(sub)) {
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
        deposits: gang.deposits || {}
      };
    });

    if (infoResult.notInGang) {
      await message.reply('❌ Nie znaleziono gangu dla podanej nazwy, osoby lub ID.');
      return;
    }

    const bossName = await getName(infoResult.bossId);
    const deputyNamesList = await Promise.all(infoResult.deputies.map(async id => await getName(id)));
    const deputyNames = deputyNamesList.join(', ') || 'Brak';

    const memberNamesList = await Promise.all(infoResult.members.map(async id => {
      const roleStr = id === infoResult.bossId ? '👑 Boss' : infoResult.deputies.includes(id) ? '⭐ Zastępca' : '👤 Członek';
      const nameStr = await getName(id);
      const deposited = infoResult.deposits[id] || 0;
      return `• ${nameStr} (${roleStr}) — wpłacił: ${formatCurrency(deposited)}`;
    }));
    const memberNames = memberNamesList.join('\n');

    const maxMembers = 5 + infoResult.levelDziupla;

    let bonusesStr = '';
    const bizPerc = [0, 10, 20, 30][infoResult.levelBiznesy];
    const fachPerc = [0, 2, 4, 5][infoResult.levelFach];
    bonusesStr += `📈 Biznesy (Praca): **+${bizPerc}%** (Lvl ${infoResult.levelBiznesy}/3)\n`;
    bonusesStr += `🥷 Fach (Kradzieże): **+${fachPerc}%** (Lvl ${infoResult.levelFach}/3)\n`;
    bonusesStr += `📦 Dziupla (Pojemność): **${infoResult.members.length}/${maxMembers}** (Lvl ${infoResult.levelDziupla}/10)`;

    await message.reply(
      `👥 **GANG: ${infoResult.name.toUpperCase()}** 👥\n` +
      `👑 Boss: **${bossName}**\n` +
      `⭐ Zastępcy: **${deputyNames}**\n` +
      `💰 Sejf gangu: **${formatCurrency(infoResult.vault)}**\n\n` +
      `🛡️ **Ulepszenia i bonusy:**\n${bonusesStr}\n\n` +
      `👥 **Członkowie:**\n${memberNames}`
    );
  }
};
