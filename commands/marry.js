const { ensureInventoryRecord, refreshBadges, formatCurrency } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function getPartnerLabel(client, userId) {
  if (client.userNames.has(userId)) {
    return client.userNames.get(userId);
  }
  return `Użytkownik_${userId.slice(-6)}`;
}

module.exports = {
  name: 'marry',
  aliases: ['slub'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();

    if (!action) {
      const status = await withData(store => {
        const user = createUser(message.author.id, store.users);
        refreshBadges(user, ensureInventoryRecord(store.inventory, message.author.id));
        
        let bankInfo = null;
        if (user.marriedTo) {
          const marriageKey = [message.author.id, user.marriedTo].sort().join('-');
          store.profiles.marriageBanks = store.profiles.marriageBanks || {};
          if (store.profiles.marriageBanks[marriageKey]) {
            const bank = store.profiles.marriageBanks[marriageKey];
            bankInfo = {
              balance: bank.balance || 0,
              myContribution: bank.contributions[message.author.id] || 0
            };
          } else {
            bankInfo = {
              balance: 0,
              myContribution: 0
            };
          }
        }
        return { marriedTo: user.marriedTo, bankInfo };
      });

      if (status.marriedTo) {
        let replyMsg = `💍 Status związku: Jesteś w związku z **${getPartnerLabel(client, status.marriedTo)}**.\n`;
        if (status.bankInfo) {
          replyMsg += `🏦 Wspólny bank małżeński: **${formatCurrency(status.bankInfo.balance)}** (Twój wkład: **${formatCurrency(status.bankInfo.myContribution)}/100 000**).\n` +
                      `💡 Wpłać: **!marry wplac <kwota>** | Wypłać: **!marry wyplac <kwota>**`;
        }
        await message.reply(replyMsg);
      } else {
        await message.reply('💍 Status związku: Nie jesteś w żadnym związku. Użyj **!marry @osoba** lub **!marry <id>**.');
      }
      return;
    }

    if (action === 'wplac' || action === 'deposit' || action === 'wplata') {
      let isAll = false;
      let amount = 0;
      if (String(args[1] || '').toLowerCase() === 'all') {
        isAll = true;
      } else {
        amount = Math.floor(Number(args[1]));
        if (isNaN(amount) || amount <= 0) {
          await message.reply('❌ Podaj poprawną kwotę lub **all**: **!marry wplac <kwota|all>**');
          return;
        }
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        if (!user.marriedTo) {
          return { error: '❌ Nie jesteś w związku małżeńskim. Najpierw weź ślub za pomocą **!marry @osoba**.' };
        }

        const partnerId = user.marriedTo;
        const marriageKey = [message.author.id, partnerId].sort().join('-');

        store.profiles.marriageBanks = store.profiles.marriageBanks || {};
        store.profiles.marriageBanks[marriageKey] = store.profiles.marriageBanks[marriageKey] || {
          balance: 0,
          contributions: {}
        };

        const bank = store.profiles.marriageBanks[marriageKey];
        bank.contributions[message.author.id] = bank.contributions[message.author.id] || 0;

        const currentContribution = bank.contributions[message.author.id];
        const remainingLimit = Math.max(0, 100000 - currentContribution);

        if (remainingLimit <= 0) {
          return { error: '❌ Osiągnąłeś już maksymalny limit wpłat (100k) do wspólnego banku małżeńskiego.' };
        }

        let depositAmount = amount;
        if (isAll) {
          depositAmount = Math.min(user.balance, remainingLimit);
        }

        if (depositAmount <= 0) {
          if (isAll) {
            return { error: '❌ Nie masz żadnych monet w portfelu do wpłacenia.' };
          }
          return { error: '❌ Podaj poprawną kwotę.' };
        }

        let lockedAmount = 0;
        if (user.activeLoan) {
          lockedAmount = user.activeLoan.originalAmount;
        }

        // Zablokowane środki z pożyczki
        if (lockedAmount > 0 && user.balance - lockedAmount < depositAmount) {
          return { error: `❌ Te środki są zablokowane z tytułu pożyczki. Wolne środki: **${formatCurrency(Math.max(0, user.balance - lockedAmount))}**` };
        }

        // Zwykły brak środków (bez pożyczki)
        if (user.balance < depositAmount) {
          return { error: `❌ Nie masz wystarczających środków. Posiadasz: ${formatCurrency(user.balance)}` };
        }

        if (currentContribution + depositAmount > 100000) {
          return { error: `❌ Nie możesz wpłacić tyle. Twój obecny wkład: **${formatCurrency(currentContribution)}/100k**. Maksymalnie możesz wpłacić jeszcze **${formatCurrency(remainingLimit)}**.` };
        }

        user.balance -= depositAmount;
        bank.balance += depositAmount;
        bank.contributions[message.author.id] += depositAmount;

        return { success: true, depositAmount, bankBalance: bank.balance, contribution: bank.contributions[message.author.id] };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🏦 Wpłaciłeś **${formatCurrency(result.depositAmount)}** do wspólnego banku małżeńskiego.\n` +
                          `💰 Stan konta wspólnego: **${formatCurrency(result.bankBalance)}**\n` +
                          `📊 Twój całkowity wkład: **${formatCurrency(result.contribution)}/100k**`);
      return;
    }

    if (action === 'wyplac' || action === 'withdraw' || action === 'wyplata') {
      let isAll = false;
      let amount = 0;
      if (String(args[1] || '').toLowerCase() === 'all') {
        isAll = true;
      } else {
        amount = Math.floor(Number(args[1]));
        if (isNaN(amount) || amount <= 0) {
          await message.reply('❌ Podaj poprawną kwotę lub **all**: **!marry wyplac <kwota|all>**');
          return;
        }
      }

      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        if (!user.marriedTo) {
          return { error: '❌ Nie jesteś w związku małżeńskim.' };
        }

        const partnerId = user.marriedTo;
        const marriageKey = [message.author.id, partnerId].sort().join('-');

        store.profiles.marriageBanks = store.profiles.marriageBanks || {};
        const bank = store.profiles.marriageBanks[marriageKey];
        if (!bank || !bank.balance || bank.balance <= 0) {
          return { error: '❌ Wspólny bank małżeński jest pusty.' };
        }

        let withdrawAmount = amount;
        if (isAll) {
          withdrawAmount = bank.balance;
        }

        if (withdrawAmount <= 0) {
          return { error: '❌ Podaj poprawną kwotę.' };
        }

        if (bank.balance < withdrawAmount) {
          return { error: `❌ We wspólnym banku nie ma tylu monet. Stan konta: **${formatCurrency(bank.balance)}**` };
        }

        user.balance += withdrawAmount;
        bank.balance -= withdrawAmount;

        // Reduce this partner's contribution count by the amount withdrawn, capped at 0
        bank.contributions[message.author.id] = bank.contributions[message.author.id] || 0;
        bank.contributions[message.author.id] = Math.max(0, bank.contributions[message.author.id] - withdrawAmount);

        return { success: true, withdrawAmount, bankBalance: bank.balance, contribution: bank.contributions[message.author.id] };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🏦 Wypłaciłeś **${formatCurrency(result.withdrawAmount)}** ze wspólnego banku małżeńskiego do swojego portfela.\n` +
                          `💰 Stan konta wspólnego: **${formatCurrency(result.bankBalance)}**\n` +
                          `📊 Twój wkład po wypłacie: **${formatCurrency(result.contribution)}/100k**`);
      return;
    }

    if (action === 'accept' || action === 'decline') {
      let proposerId = null;

      const mentioned = message.mentions.users.first();
      if (mentioned) {
        proposerId = mentioned.id;
      } else if (args[1] && /^\d+$/.test(args[1])) {
        proposerId = args[1];
      }

      if (!proposerId) {
        await message.reply('❌ Użyj: **!marry accept @osoba** lub **!marry accept <id>**.');
        return;
      }

      const requestId = `${proposerId}-${message.author.id}`;
      const request = client.marriageRequests.get(requestId);

      if (!request) {
        await message.reply('❌ Brak aktywnej propozycji od tego użytkownika lub propozycja wygasła.');
        return;
      }

      client.marriageRequests.delete(requestId);

      if (action === 'decline') {
        await message.reply(`💍 Odrzuciłeś propozycję ślubu od **${getPartnerLabel(client, proposerId)}**.`);
        return;
      }

      const result = await withData(store => {
        if (store.profiles.blacklist && (store.profiles.blacklist.includes(proposerId) || store.profiles.blacklist.includes(message.author.id))) {
          return { error: '❌ Jeden z użytkowników jest zablokowany i nie można wejść z nim w interakcję.' };
        }

        const proposer = createUser(proposerId, store.users);
        const partner = createUser(message.author.id, store.users);

        if (proposer.marriedTo || partner.marriedTo) {
          return { error: '❌ Jedno z Was jest już w związku małżeńskim.' };
        }

        proposer.marriedTo = message.author.id;
        partner.marriedTo = proposerId;
        refreshBadges(proposer, ensureInventoryRecord(store.inventory, proposerId));
        refreshBadges(partner, ensureInventoryRecord(store.inventory, message.author.id));

        return { success: true };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Ślub zawarty! Jesteście teraz małżeństwem z **${getPartnerLabel(client, proposerId)}**!`);
      return;
    }

    // Proponowanie ślubu: @mention lub raw ID
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
      await message.reply('❌ Użyj: **!marry @osoba** lub **!marry <id>**.');
      return;
    }

    if (targetId === message.author.id) {
      await message.reply('❌ Nie możesz poślubić samego siebie.');
      return;
    }

    const validation = await withData(store => {
      if (store.profiles.blacklist && store.profiles.blacklist.includes(targetId)) {
        return { error: '❌ Ten użytkownik jest zablokowany i nie możesz wchodzić z nim w interakcje.' };
      }

      const proposer = createUser(message.author.id, store.users);
      const partner = createUser(targetId, store.users);
      refreshBadges(proposer, ensureInventoryRecord(store.inventory, message.author.id));
      refreshBadges(partner, ensureInventoryRecord(store.inventory, targetId));

      if (proposer.marriedTo) {
        return { error: `❌ Jesteś już w związku z **${getPartnerLabel(client, proposer.marriedTo)}**.` };
      }

      if (partner.marriedTo) {
        return { error: `❌ **${targetName}** jest już w związku małżeńskim.` };
      }

      return { success: true };
    });

    if (validation.error) {
      await message.reply(validation.error);
      return;
    }

    const requestId = `${message.author.id}-${targetId}`;
    client.marriageRequests.set(requestId, {
      proposerId: message.author.id,
      targetId: targetId
    });

    setTimeout(() => {
      client.marriageRequests.delete(requestId);
    }, 120000).unref();

    await message.reply(`💍 Wysłano propozycję ślubu do **${targetName}**. Druga osoba musi wpisać **!marry accept ${message.author.id}** w ciągu 2 minut.`);
  }
};
