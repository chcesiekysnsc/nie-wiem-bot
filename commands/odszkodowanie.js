const { formatCurrency, msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'odszkodowanie',
  aliases: ['ubezpieczenie', 'polisa', 'roszczenie', 'insurance'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();
    const userId = message.author.id;
    const now = Date.now();

    // --- SUBCOMMAND: KUP ---
    if (action === 'kup' || action === 'buy') {
      const result = await withData(store => {
        const user = createUser(userId, store.users);
        if (!store.profiles) store.profiles = {};
        if (!store.profiles.ubezpieczenia) store.profiles.ubezpieczenia = {};

        const currentIns = store.profiles.ubezpieczenia[userId];
        if (currentIns && currentIns.expiresAt && currentIns.expiresAt > now) {
          const remaining = msToReadable(currentIns.expiresAt - now);
          return { error: `❌ Posiadasz już aktywną polisę ubezpieczeniową! Wygasa za **${remaining}**.` };
        }

        const policyPrice = 400000;
        if (user.balance < policyPrice) {
          return { error: `❌ Polisa kosztuje **${formatCurrency(policyPrice)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= policyPrice;
        const validMs = 7 * 24 * 3600 * 1000; // 7 days
        store.profiles.ubezpieczenia[userId] = {
          boughtAt: now,
          expiresAt: now + validMs,
          lastClaimAt: 0,
          lastRobLoss: 0,
          totalRefunded: currentIns ? (currentIns.totalRefunded || 0) : 0
        };

        return { success: true, policyPrice, expiresAt: now + validMs, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🛡️ **ZAKUPIONO POLISĘ UBEZPIECZENIOWĄ!**\nKoszt: **${formatCurrency(result.policyPrice)}** | Ważność: **7 dni**.\n💡 W przypadku okradzenia Cię w !rob otrzymasz **35% zwrotu strat**!`);
      return;
    }

    // --- SUBCOMMAND: ROSZCZENIE ---
    if (action === 'roszczenie' || action === 'claim') {
      const result = await withData(store => {
        if (!store.profiles || !store.profiles.ubezpieczenia || !store.profiles.ubezpieczenia[userId]) {
          return { error: '❌ Nie posiadasz aktywnej polisy ubezpieczeniowej! Kup ją za pomocą **!odszkodowanie kup**.' };
        }

        const ins = store.profiles.ubezpieczenia[userId];
        if (!ins.expiresAt || ins.expiresAt <= now) {
          return { error: '❌ Twoja polisa ubezpieczeniowa wygasła! Kup nową komendą **!odszkodowanie kup**.' };
        }

        if (!ins.lastRobLoss || ins.lastRobLoss <= 0) {
          return { error: '❌ Nie odnotowano żadnej niedawnej kradzieży na Twoim koncie!' };
        }

        const cdMs = 24 * 3600 * 1000; // 24h
        const diff = now - (ins.lastClaimAt || 0);
        if (diff < cdMs) {
          return { error: `⏳ Możesz złożyć tylko 1 roszczenie na 24h! Kolejne za **${msToReadable(cdMs - diff)}**.` };
        }

        const refund = Math.floor(ins.lastRobLoss * 0.35); // 35% refund
        const user = createUser(userId, store.users);

        user.balance += refund;
        ins.lastClaimAt = now;
        ins.totalRefunded = (ins.totalRefunded || 0) + refund;
        const lossAmount = ins.lastRobLoss;
        ins.lastRobLoss = 0; // reset after claim

        return { success: true, refund, lossAmount, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💰 **ROSZCZENIE PRZYJĘTE!**\nWypłacono odszkodowanie w wysokości **35% strat** (**+${formatCurrency(result.refund)}**) z kradzieży **${formatCurrency(result.lossAmount)}**!\n💳 Nowy stan konta: **${formatCurrency(result.balance)}**.`);
      return;
    }

    // DEFAULT: SHOW POLICY STATUS
    const insStatus = await withData(store => {
      if (!store.profiles || !store.profiles.ubezpieczenia || !store.profiles.ubezpieczenia[userId]) {
        return null;
      }
      return store.profiles.ubezpieczenia[userId];
    });

    let view = `🛡️ **SYSTEM UBEZPIECZEŃ OD KRADZIEŻY (!ROB)**\n`;
    view += `Zabezpiecz się przed ubytkami w portfelu — ubezpieczyciel zwraca 35% strat po kradzieży!\n\n`;

    if (insStatus && insStatus.expiresAt && insStatus.expiresAt > now) {
      view += `✅ **STAN POLISY:** Aktywna\n`;
      view += `   ↳ Wygasa za: **${msToReadable(insStatus.expiresAt - now)}**\n`;
      view += `   ↳ Ostatnia zgłoszona strata: **${formatCurrency(insStatus.lastRobLoss || 0)}**\n`;
      view += `   ↳ Łącznie wypłacono odszkodowań: **${formatCurrency(insStatus.totalRefunded || 0)}**\n\n`;
      if (insStatus.lastRobLoss > 0) {
        const potentialRefund = Math.floor(insStatus.lastRobLoss * 0.35);
        view += `💡 **DOSTĘPNE ROSZCZENIE:** Zwrot **${formatCurrency(potentialRefund)}**! Wpisz **!odszkodowanie roszczenie**\n\n`;
      }
    } else {
      view += `❌ **STAN POLISY:** Brak aktywnej polisy\n\n`;
    }

    view += `📋 **WARUNKI UBEZPIECZENIA:**\n`;
    view += `   ↳ Koszt zakupu: **400,000💰** (Ważność: 7 dni)\n`;
    view += `   ↳ Odszkodowanie: **35% kwoty skradzionej** w udanym napadzie\n`;
    view += `   ↳ Limit roszczeń: 1 roszczenie na 24 godziny\n\n`;
    view += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    view += `💡 Kup polisę: **!odszkodowanie kup**\n`;
    view += `💡 Zgłoś roszczenie po kradzieży: **!odszkodowanie roszczenie**`;

    await message.reply(view);
  }
};
