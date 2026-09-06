const { formatCurrency, msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

async function resolveUserName(client, uid) {
  if (!uid) return 'Nieznany';
  if (typeof client.resolveUserName === 'function') {
    try {
      const name = await client.resolveUserName(uid);
      if (name) return name;
    } catch (_) {}
  }
  if (client.userNames && client.userNames.get(uid)) {
    return client.userNames.get(uid);
  }
  try {
    const { loadData } = require('../utils/storage');
    const usersData = loadData('users');
    if (usersData && usersData[uid] && usersData[uid].name) {
      if (client.userNames) client.userNames.set(uid, usersData[uid].name);
      return usersData[uid].name;
    }
  } catch (_) {}
  if (client.api && typeof client.api.getUserInfo === 'function') {
    try {
      const info = await new Promise((resolve) => {
        client.api.getUserInfo(uid, (err, ret) => {
          if (!err && ret && ret[uid] && ret[uid].name) {
            resolve(ret[uid].name);
          } else {
            resolve(null);
          }
        });
      });
      if (info) {
        if (client.userNames) client.userNames.set(uid, info);
        return info;
      }
    } catch (_) {}
  }
  return client.userNames?.get(uid) || `Użytkownik_${String(uid).slice(-6)}`;
}

module.exports = {
  name: 'spolka',
  aliases: ['spółka', 'spolki', 'spółki', 'akcje'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();
    const userId = message.author.id;

    // Helper to find user's company
    const findUserCompany = (spolki, uid) => {
      for (const [sId, spolka] of Object.entries(spolki)) {
        if (spolka.members && spolka.members[uid]) {
          return spolka;
        }
      }
      return null;
    };

    // --- SUBCOMMAND: STWORZ ---
    if (action === 'stworz' || action === 'stwórz' || action === 'create') {
      const name = String(args[1] || '').trim();
      const wkladRaw = args[2];

      if (!name || name.length < 3 || name.length > 25) {
        await message.reply('❌ Nazwa spółki musi mieć od 3 do 25 znaków! Przykład: **!spolka stworz CyberCorp 1000000**');
        return;
      }

      const wklad = parseInt(wkladRaw, 10);
      if (isNaN(wklad) || wklad < 500000 || wklad > 5000000) {
        await message.reply('❌ Początkowy wkład musi wynosić od **500,000💰** do **5,000,000💰**!');
        return;
      }

      const result = await withData(store => {
        const user = createUser(userId, store.users);
        if (!store.profiles) store.profiles = {};
        if (!store.profiles.spolki) store.profiles.spolki = {};

        const existing = findUserCompany(store.profiles.spolki, userId);
        if (existing) {
          return { error: `❌ Jesteś już członkiem spółki **${existing.name}**! Musisz ją opuścić (**!spolka opusc**) przed założeniem nowej.` };
        }

        // Check if name is taken
        for (const s of Object.values(store.profiles.spolki)) {
          if (s.name.toLowerCase() === name.toLowerCase()) {
            return { error: `❌ Spółka o nazwie **${name}** już istnieje!` };
          }
        }

        if (user.balance < wklad) {
          return { error: `❌ Brak wystarczających środków! Wkład to **${formatCurrency(wklad)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= wklad;
        const spolkaId = 'spolka_' + Date.now();
        store.profiles.spolki[spolkaId] = {
          id: spolkaId,
          name: name,
          prezesId: userId,
          totalCapital: wklad,
          createdAt: Date.now(),
          lastDywidenda: 0,
          members: {
            [userId]: { wklad: wklad, joinedAt: Date.now() }
          }
        };

        return { success: true, name, wklad, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🏢 **GRATULACJE!** Utworzono spółkę akcyjną **${result.name}** z wkładem **${formatCurrency(result.wklad)}**!\n👑 Zostałeś jej Prezesem.`);
      return;
    }

    // --- SUBCOMMAND: DOLACZ ---
    if (action === 'dolacz' || action === 'dołącz' || action === 'join') {
      const targetQuery = args[1];
      const wkladRaw = args[2];

      if (!targetQuery || !wkladRaw) {
        await message.reply('❌ Użycie: **!spolka dolacz <Nazwa/ID> <wkład>** (min. wkład 100,000💰).');
        return;
      }

      const wklad = parseInt(wkladRaw, 10);
      if (isNaN(wklad) || wklad < 100000) {
        await message.reply('❌ Minimalny wkład udziałowca wynosi **100,000💰**!');
        return;
      }

      const result = await withData(store => {
        const user = createUser(userId, store.users);
        if (!store.profiles) store.profiles = {};
        if (!store.profiles.spolki) store.profiles.spolki = {};

        const existing = findUserCompany(store.profiles.spolki, userId);
        if (existing) {
          return { error: `❌ Jesteś już członkiem spółki **${existing.name}**!` };
        }

        let targetSpolka = null;
        for (const s of Object.values(store.profiles.spolki)) {
          if (s.id === targetQuery || s.name.toLowerCase() === targetQuery.toLowerCase()) {
            targetSpolka = s;
            break;
          }
        }

        if (!targetSpolka) {
          return { error: '❌ Nie znaleziono spółki o podanej nazwie lub ID!' };
        }

        const memberCount = Object.keys(targetSpolka.members || {}).length;
        if (memberCount >= 5) {
          return { error: '❌ Ta spółka osiągnęła już maksymalny limit 5 udziałowców!' };
        }

        if (user.balance < wklad) {
          return { error: `❌ Nie masz wystarczająco środków! Wkład to **${formatCurrency(wklad)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= wklad;
        targetSpolka.members[userId] = { wklad: wklad, joinedAt: Date.now() };
        targetSpolka.totalCapital += wklad;

        const sharePct = ((wklad / targetSpolka.totalCapital) * 100).toFixed(1);
        return { success: true, spolkaName: targetSpolka.name, wklad, sharePct, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Dołączyłeś do spółki **${result.spolkaName}** wpłacając **${formatCurrency(result.wklad)}**!\n📊 Twój udział wynosi obecnie **${result.sharePct}%**.`);
      return;
    }

    // --- SUBCOMMAND: INWESTUJ ---
    if (action === 'inwestuj' || action === 'invest') {
      const kwotaRaw = args[1];
      const kwota = parseInt(kwotaRaw, 10);
      if (isNaN(kwota) || kwota <= 0) {
        await message.reply('❌ Podaj prawidłową kwotę do zainwestowania! Przykład: **!spolka inwestuj 250000**');
        return;
      }

      const result = await withData(store => {
        const user = createUser(userId, store.users);
        if (!store.profiles || !store.profiles.spolki) return { error: '❌ Nie jesteś członkiem żadnej spółki!' };

        const spolka = findUserCompany(store.profiles.spolki, userId);
        if (!spolka) return { error: '❌ Nie jesteś członkiem żadnej spółki!' };

        if (user.balance < kwota) {
          return { error: `❌ Brak środków! Kwota: **${formatCurrency(kwota)}**, posiadasz: **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= kwota;
        spolka.members[userId].wklad += kwota;
        spolka.totalCapital += kwota;

        const newShare = ((spolka.members[userId].wklad / spolka.totalCapital) * 100).toFixed(1);
        return { success: true, name: spolka.name, kwota, newShare, totalWklad: spolka.members[userId].wklad };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`📈 Zainwestowano dodatkowe **${formatCurrency(result.kwota)}** w spółkę **${result.name}**!\n💼 Łączny Twój wkład: **${formatCurrency(result.totalWklad)}** (Nowy udział: **${result.newShare}%**).`);
      return;
    }

    // --- SUBCOMMAND: DYWIDENDA ---
    if (action === 'dywidenda' || action === 'payout') {
      const result = await withData(store => {
        if (!store.profiles || !store.profiles.spolki) return { error: '❌ Nie jesteś członkiem żadnej spółki!' };
        const spolka = findUserCompany(store.profiles.spolki, userId);
        if (!spolka) return { error: '❌ Nie jesteś członkiem żadnej spółki!' };

        if (spolka.prezesId !== userId) {
          return { error: '❌ Tylko Prezes spółki może wypłacać dywidendy!' };
        }

        const now = Date.now();
        const cdMs = 12 * 3600 * 1000;
        const diff = now - (spolka.lastDywidenda || 0);
        if (diff < cdMs) {
          return { error: `⏳ Dywidendę można wypłacać co 12h! Następna za **${msToReadable(cdMs - diff)}**.` };
        }

        const divPct = 0.08 + Math.random() * 0.04; // 8% - 12%
        const totalPula = Math.floor(spolka.totalCapital * divPct);
        const memberPayouts = [];

        for (const [mId, mData] of Object.entries(spolka.members)) {
          const shareRatio = mData.wklad / spolka.totalCapital;
          const memberShareAmount = Math.floor(totalPula * shareRatio);
          const memberUser = createUser(mId, store.users);
          memberUser.balance += memberShareAmount;
          memberPayouts.push({ id: mId, amount: memberShareAmount, pct: (shareRatio * 100).toFixed(1) });
        }

        spolka.lastDywidenda = now;
        return { success: true, name: spolka.name, totalPula, memberPayouts };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      let msg = `💰 **WYPŁATA DYWIDENDY — ${result.name}**\n`;
      msg += `Wygenerowano łączną pulę: **${formatCurrency(result.totalPula)}**!\n\n`;
      msg += `📋 **Podział środków:**\n`;
      for (const p of result.memberPayouts) {
        const pName = await resolveUserName(client, p.id);
        msg += `   ↳ **${pName}** (${p.pct}%): **+${formatCurrency(p.amount)}**\n`;
      }

      await message.reply(msg);
      return;
    }

    // --- SUBCOMMAND: OPUSC ---
    if (action === 'opusc' || action === 'opuszczam' || action === 'leave') {
      const result = await withData(store => {
        if (!store.profiles || !store.profiles.spolki) return { error: '❌ Nie jesteś w żadnej spółce!' };
        const spolka = findUserCompany(store.profiles.spolki, userId);
        if (!spolka) return { error: '❌ Nie jesteś w żadnej spółce!' };

        if (spolka.prezesId === userId) {
          return { error: '❌ Jako Prezes nie możesz opuścić spółki! Musisz ją rozwiązać komendą **!spolka rozwiaz**.' };
        }

        const user = createUser(userId, store.users);
        const mData = spolka.members[userId];
        const refund = Math.floor(mData.wklad * 0.70); // 70% refund

        user.balance += refund;
        spolka.totalCapital -= mData.wklad;
        delete spolka.members[userId];

        return { success: true, name: spolka.name, refund, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🚪 Opuszczono spółkę **${result.name}**. Otrzymujesz 70% wkładu (**${formatCurrency(result.refund)}**).\n💳 Nowy stan konta: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // --- SUBCOMMAND: ROZWIAZ ---
    if (action === 'rozwiaz' || action === 'rozwiąż' || action === 'dissolve') {
      const result = await withData(store => {
        if (!store.profiles || !store.profiles.spolki) return { error: '❌ Nie jesteś w żadnej spółce!' };
        const spolka = findUserCompany(store.profiles.spolki, userId);
        if (!spolka) return { error: '❌ Nie jesteś w żadnej spółce!' };

        if (spolka.prezesId !== userId) {
          return { error: '❌ Tylko Prezes może rozwiązać spółkę!' };
        }

        for (const [mId, mData] of Object.entries(spolka.members)) {
          const mUser = createUser(mId, store.users);
          const refund = Math.floor(mData.wklad * 0.80); // 80% refund for all
          mUser.balance += refund;
        }

        const name = spolka.name;
        delete store.profiles.spolki[spolka.id];
        return { success: true, name };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💥 Spółka **${result.name}** została rozwiązana przez Prezesa! Wszyscy udziałowcy otrzymali 80% wniesionego wkładu.`);
      return;
    }

    // Helper functions for rendering
    const renderCompanyDetails = async (s, isMyCompany) => {
      const prezesName = await resolveUserName(client, s.prezesId);
      let text = `🏢 **${isMyCompany ? 'TWOJA SPÓŁKA' : 'SPÓŁKA'}: ${s.name}**\n`;
      text += `👑 Prezes: **${prezesName}**\n`;
      text += `💰 Całkowity Kapitał: **${formatCurrency(s.totalCapital)}**\n`;
      text += `👥 Udziałowcy (${Object.keys(s.members || {}).length}/5):\n`;
      for (const [mId, mData] of Object.entries(s.members || {})) {
        const memberName = await resolveUserName(client, mId);
        const pct = ((mData.wklad / s.totalCapital) * 100).toFixed(1);
        text += `   ↳ **${memberName}**: **${formatCurrency(mData.wklad)}** (${pct}%)\n`;
      }
      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      if (isMyCompany) {
        text += `💡 **!spolka inwestuj <kwota>** — Zwiększ swój wkład\n`;
        if (s.prezesId === userId) {
          text += `💡 **!spolka dywidenda** — Wypłać dywidendę udziałowcom\n`;
          text += `💡 **!spolka rozwiaz** — Rozwiąż spółkę\n`;
        } else {
          text += `💡 **!spolka opusc** — Opuść spółkę (70% zwrotu)\n`;
        }
      } else {
        text += `💡 Dołącz do spółki: **!spolka dolacz ${s.name} <wkład>** (min. 100k)\n`;
      }
      return text;
    };

    const renderPublicList = async (allCompanies) => {
      let list = `🏢 **SYSTEM SPÓŁEK AKCYJNYCH**\n`;
      list += `Dołącz do spółki lub załóż własną, aby generować dywidendy!\n\n`;
      if (allCompanies.length === 0) {
        list += `📑 Brak aktywnych spółek na serwerze. Bądź pierwszym założycielem!\n`;
      } else {
        list += `📋 **Dostępne spółki:**\n`;
        for (let idx = 0; idx < Math.min(allCompanies.length, 10); idx++) {
          const s = allCompanies[idx];
          const count = Object.keys(s.members || {}).length;
          const prezesName = await resolveUserName(client, s.prezesId);
          list += `**${idx + 1}. ${s.name}** (ID: \`${s.id}\`)\n`;
          list += `   ↳ Prezes: **${prezesName}** | Kapitał: **${formatCurrency(s.totalCapital)}** | Członkowie: **${count}/5**\n`;
        }
      }
      list += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      list += `💡 Stwórz spółkę: **!spolka stworz <nazwa> <wkład>** (min. 500k)\n`;
      list += `💡 Dołącz do spółki: **!spolka dolacz <nazwa/ID> <wkład>** (min. 100k)\n`;
      list += `💡 Sprawdź spółkę: **!spolka info <nazwa/ID>**`;
      return list;
    };

    // --- SUBCOMMAND: LISTA ---
    if (['lista', 'list', 'ranking', 'all', 'wszystkie'].includes(action)) {
      const allCompanies = await withData(store => {
        if (!store.profiles || !store.profiles.spolki) return [];
        return Object.values(store.profiles.spolki);
      });
      const listText = await renderPublicList(allCompanies);
      await message.reply(listText);
      return;
    }

    // --- SUBCOMMAND: INFO <nazwa/ID> ---
    if (action === 'info' || action === 'sprawdz' || action === 'view') {
      const targetQuery = args.slice(1).join(' ').trim();
      if (!targetQuery) {
        await message.reply('❌ Podaj nazwę lub ID spółki! Przykład: **!spolka info CyberCorp**');
        return;
      }

      const targetSpolka = await withData(store => {
        if (!store.profiles || !store.profiles.spolki) return null;
        for (const s of Object.values(store.profiles.spolki)) {
          if (s.id === targetQuery || s.name.toLowerCase() === targetQuery.toLowerCase()) {
            return s;
          }
        }
        return null;
      });

      if (!targetSpolka) {
        await message.reply('❌ Nie znaleziono spółki o podanej nazwie lub ID!');
        return;
      }

      const isMy = targetSpolka.members && !!targetSpolka.members[userId];
      const details = await renderCompanyDetails(targetSpolka, isMy);
      await message.reply(details);
      return;
    }

    // If argument given that is not recognized, check if it's a company name directly
    if (action && !['pomoc', 'help'].includes(action)) {
      const targetQuery = args.join(' ').trim();
      const matchedSpolka = await withData(store => {
        if (!store.profiles || !store.profiles.spolki) return null;
        for (const s of Object.values(store.profiles.spolki)) {
          if (s.id === targetQuery || s.name.toLowerCase() === targetQuery.toLowerCase()) {
            return s;
          }
        }
        return null;
      });

      if (matchedSpolka) {
        const isMy = matchedSpolka.members && !!matchedSpolka.members[userId];
        const details = await renderCompanyDetails(matchedSpolka, isMy);
        await message.reply(details);
        return;
      }
    }

    // DEFAULT: SHOW USER COMPANY OR GLOBAL LIST
    const spolkaInfo = await withData(store => {
      if (!store.profiles || !store.profiles.spolki) return { mySpolka: null, all: [] };
      const mySpolka = findUserCompany(store.profiles.spolki, userId);
      const all = Object.values(store.profiles.spolki);
      return { mySpolka, all };
    });

    if (spolkaInfo.mySpolka) {
      const details = await renderCompanyDetails(spolkaInfo.mySpolka, true);
      await message.reply(details);
      return;
    }

    const listText = await renderPublicList(spolkaInfo.all);
    await message.reply(listText);
  }
};
