const config = require('../config/config');
const { ensureInventoryRecord, formatCurrency, recordGame, refreshBadges, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

function normalizeAsset(input) {
  const val = String(input || '').toLowerCase().trim();
  if (['bank', 'b'].includes(val)) return 'bank';
  if (['srebro', 's', 'silver'].includes(val)) return 'srebro';
  if (['zloto', 'złoto', 'z', 'gold'].includes(val)) return 'zloto';
  if (['diamenty', 'diament', 'd', 'diamonds', 'diamond'].includes(val)) return 'diamenty';
  return null;
}

function displayAsset(asset) {
  if (asset === 'bank') return '🏦 Bank';
  if (asset === 'srebro') return '🥈 Srebro';
  if (asset === 'zloto') return '🪙 Złoto';
  if (asset === 'diamenty') return '💎 Diamenty';
  return asset;
}

module.exports = {
  name: 'gielda',
  aliases: ['stock', 'giełda'],
  async execute(client, message, args) {
    client.stockSessions = client.stockSessions || new Map();
    const threadId = message.guild?.id || message.rawEvent?.threadID || 'default_thread';
    const sub = String(args[0] || '').toLowerCase().trim();

    // ==========================================
    // 1. SHOW ACTIVE SESSION INFO (No args or "info")
    // ==========================================
    if (!sub || sub === 'info') {
      const session = client.stockSessions.get(threadId);
      if (!session) {
        await message.reply(
          `📈 **GIELDA** 📈\n` +
          `Brak aktywnej sesji giełdy na tej grupie.\n\n` +
          `Wpisz **!gielda start**, aby utworzyć nowe lobby i zacząć grę!`
        );
        return;
      }

      const hostName = await client.resolveUserName(session.hostId);
      const participantCount = session.participants.size;

      // Resolve participant names
      const participantNames = [];
      for (const pid of session.participants) {
        const name = await client.resolveUserName(pid);
        participantNames.push(name);
      }

      if (session.state === 'lobby') {
        const elapsed = Date.now() - session.startTime;
        const remaining = Math.max(0, Math.ceil((session.lobbyDuration - elapsed) / 1000));

        await message.reply(
          `📈 **LOBBY GIEŁDY (Zapisy)** 📈\n` +
          `Założyciel: **${hostName}**\n` +
          `Uczestnicy (**${participantCount}/8**): ${participantNames.join(', ')}\n` +
          `Pozostały czas na dołączenie: **${remaining}s**\n\n` +
          `Dostępne aktywa w tej sesji (zakresy ryzyka):\n` +
          `🏦 **Bank**: od ${session.assets.bank.min}% do +${session.assets.bank.max}%\n` +
          `🥈 **Srebro**: od ${session.assets.srebro.min}% do +${session.assets.srebro.max}%\n` +
          `🪙 **Złoto**: od ${session.assets.zloto.min}% do +${session.assets.zloto.max}%\n` +
          `💎 **Diamenty**: od ${session.assets.diamenty.min}% do +${session.assets.diamenty.max}%\n\n` +
          `Wpisz **!gielda dolacz**, aby wziąć udział!`
        );
      } else if (session.state === 'investing') {
        const elapsed = Date.now() - session.investStartTime;
        const remaining = Math.max(0, Math.ceil((session.investDuration - elapsed) / 1000));

        // Construct investment list (who invested in what without showing amount)
        const investList = [];
        for (const pid of session.participants) {
          const name = await client.resolveUserName(pid);
          const inv = session.investments.get(pid);
          if (inv) {
            investList.push(`• **${name}** -> ${displayAsset(inv.asset)} (kwota ukryta)`);
          } else {
            investList.push(`• **${name}** -> *Brak inwestycji*`);
          }
        }

        await message.reply(
          `📈 **RUNDA INWESTOWANIA** 📈\n` +
          `Uczestnicy giełdy (**${participantCount}/8**):\n${investList.join('\n')}\n\n` +
          `Pozostały czas do losowania wyników: **${remaining}s**\n\n` +
          `Aktywa i zakresy ryzyka:\n` +
          `🏦 **Bank**: od ${session.assets.bank.min}% do +${session.assets.bank.max}%\n` +
          `🥈 **Srebro**: od ${session.assets.srebro.min}% do +${session.assets.srebro.max}%\n` +
          `🪙 **Złoto**: od ${session.assets.zloto.min}% do +${session.assets.zloto.max}%\n` +
          `💎 **Diamenty**: od ${session.assets.diamenty.min}% do +${session.assets.diamenty.max}%\n\n` +
          `Wpisz **!gielda inwestuj <kwota> <aktywo>**, aby zainwestować!`
        );
      }
      return;
    }

    // ==========================================
    // 2. START A NEW SESSION
    // ==========================================
    if (sub === 'start') {
      const session = client.stockSessions.get(threadId);
      if (session) {
        await message.reply('❌ Na tej grupie trwa już sesja giełdy!');
        return;
      }

      const crypto = require('crypto');
      const newSession = {
        state: 'lobby',
        hostId: message.author.id,
        participants: new Set([message.author.id]),
        investments: new Map(),
        startTime: Date.now(),
        lobbyDuration: 120000, // 120 seconds lobby
        investDuration: 60000,  // 60 seconds investing
        assets: {
          bank: { min: crypto.randomInt(-7, -2), max: crypto.randomInt(8, 13) },
          srebro: { min: crypto.randomInt(-18, -11), max: crypto.randomInt(18, 26) },
          zloto: { min: crypto.randomInt(-30, -19), max: crypto.randomInt(30, 41) },
          diamenty: { min: crypto.randomInt(-60, -39), max: crypto.randomInt(60, 91) }
        }
      };

      client.stockSessions.set(threadId, newSession);

      await message.reply(
        `📈 **START SESJI GIEŁDY!** 📈\n` +
        `**${message.author.username || 'Host'}** otworzył lobby giełdowe!\n\n` +
        `🚗 Gracze mają **2 minuty (120s)** na dołączenie.\n` +
        `Wpisz: **!gielda dolacz**, aby wejść do gry! (Maksymalnie 8 graczy)\n\n` +
        `Dostępne inwestycje w tej sesji:\n` +
        `🏦 **Bank**: od ${newSession.assets.bank.min}% do +${newSession.assets.bank.max}%\n` +
        `🥈 **Srebro**: od ${newSession.assets.srebro.min}% do +${newSession.assets.srebro.max}%\n` +
        `🪙 **Złoto**: od ${newSession.assets.zloto.min}% do +${newSession.assets.zloto.max}%\n` +
        `💎 **Diamenty**: od ${newSession.assets.diamenty.min}% do +${newSession.assets.diamenty.max}%`
      );

      // Start lobby timeout
      setTimeout(async () => {
        const active = client.stockSessions.get(threadId);
        if (!active || active.state !== 'lobby') return;

        active.state = 'investing';
        active.investStartTime = Date.now();

        // Tag all participants
        const tags = [];
        for (const pid of active.participants) {
          const name = await client.resolveUserName(pid);
          tags.push(`@${name}`);
        }

        await message.reply(
          `📈 **RUNDA INWESTOWANIA ROZPOCZĘTA!** 📈\n\n` +
          `🚗 Uczestnicy: ${tags.join(' ')}\n\n` +
          `Masz **60 sekund** na zainwestowanie swoich środków w jedno wybrane aktywo za pomocą:\n` +
          `👉 **!gielda inwestuj <kwota> <bank/srebro/zloto/diamenty>**\n\n` +
          `Zakresy zysków/strat w tej sesji:\n` +
          `🏦 **Bank**: od ${active.assets.bank.min}% do +${active.assets.bank.max}%\n` +
          `🥈 **Srebro**: od ${active.assets.srebro.min}% do +${active.assets.srebro.max}%\n` +
          `🪙 **Złoto**: od ${active.assets.zloto.min}% do +${active.assets.zloto.max}%\n` +
          `💎 **Diamenty**: od ${active.assets.diamenty.min}% do +${active.assets.diamenty.max}%\n\n` +
          `⚠️ *Po zatwierdzeniu inwestycji kwota zostanie zablokowana do losowania wyników.*`
        );

        // Start resolution timeout
        setTimeout(async () => {
          const resolveSession = client.stockSessions.get(threadId);
          if (!resolveSession || resolveSession.state !== 'investing') return;

          // Delete session from memory to allow a new game to be started
          client.stockSessions.delete(threadId);

          // Roll final outcomes
          const rolledPercentages = {
            bank: crypto.randomInt(resolveSession.assets.bank.min, resolveSession.assets.bank.max + 1),
            srebro: crypto.randomInt(resolveSession.assets.srebro.min, resolveSession.assets.srebro.max + 1),
            zloto: crypto.randomInt(resolveSession.assets.zloto.min, resolveSession.assets.zloto.max + 1),
            diamenty: crypto.randomInt(resolveSession.assets.diamenty.min, resolveSession.assets.diamenty.max + 1)
          };

          // Process database changes inside withData
          const resolution = await withData(store => {
            const results = [];

            for (const [userId, inv] of resolveSession.investments.entries()) {
              const user = createUser(userId, store.users);
              const inventory = ensureInventoryRecord(store.inventory, userId);

              const pct = rolledPercentages[inv.asset];
              const rawPayout = Math.max(0, Math.round(inv.amount * (1 + pct / 100)));
              const net = rawPayout - inv.amount;

              user.balance += rawPayout;

              let finalPayout = rawPayout;
              let badgeBonus = 0;

              // Apply Uzależniony badge bonus: +3% profit on positive wins
              if (net > 0 && user.badges && user.badges.includes(config.badges.uzalezniony)) {
                badgeBonus = Math.round(inv.amount * 0.03);
                user.balance += badgeBonus;
                finalPayout += badgeBonus;
              }

              const finalNet = finalPayout - inv.amount;
              const xpResult = recordGame(user, finalNet, 25, inventory);
              refreshBadges(user, inventory);

              results.push({
                userId,
                amount: inv.amount,
                asset: inv.asset,
                payout: finalPayout,
                net: finalNet,
                xpResult
              });
            }

            return { results };
          });

          // Build results message
          let resultMsg = `📈 **WYNIKI GIEŁDY** 📈\n\n`;
          resultMsg += `🏦 **Bank**: ${rolledPercentages.bank >= 0 ? '+' : ''}${rolledPercentages.bank}%\n`;
          resultMsg += `🥈 **Srebro**: ${rolledPercentages.srebro >= 0 ? '+' : ''}${rolledPercentages.srebro}%\n`;
          resultMsg += `🪙 **Złoto**: ${rolledPercentages.zloto >= 0 ? '+' : ''}${rolledPercentages.zloto}%\n`;
          resultMsg += `💎 **Diamenty**: ${rolledPercentages.diamenty >= 0 ? '+' : ''}${rolledPercentages.diamenty}%\n\n`;

          resultMsg += `📊 **Podsumowanie inwestorów:**\n`;
          if (resolution.results.length === 0) {
            resultMsg += `Brak inwestycji w tej rundzie.`;
          } else {
            const resLines = [];
            for (const res of resolution.results) {
              const name = await client.resolveUserName(res.userId);
              const direction = res.net >= 0 ? '📈 Zysk' : '📉 Strata';
              const formattedNet = formatCurrency(Math.abs(res.net));
              const emoji = res.asset === 'bank' ? '🏦' : res.asset === 'srebro' ? '🥈' : res.asset === 'zloto' ? '🪙' : '💎';

              let line = `• **${name}**: zainwestował **${formatCurrency(res.amount)}** w ${emoji} (${res.asset}). Payout: **${formatCurrency(res.payout)}** (${direction}: **${res.net >= 0 ? '+' : '-'}${formattedNet}**).`;
              if (res.xpResult && res.xpResult.leveledUp) {
                line += `\n  🎉 **AWANS!** Awansowałeś na **poziom ${res.xpResult.newLevel}**!`;
                if (res.xpResult.milestonesGained && res.xpResult.milestonesGained.length > 0) {
                  const { getMilestoneRewardDescription } = require('../utils/economy');
                  for (const lvl of res.xpResult.milestonesGained) {
                    line += `\n  🎁 Nagroda kamienia milowego: **${getMilestoneRewardDescription(lvl)}**!`;
                  }
                }
              }
              resLines.push(line);
            }
            resultMsg += resLines.join('\n');
          }

          await message.reply(resultMsg);

        }, active.investDuration);

      }, newSession.lobbyDuration);

      return;
    }

    // ==========================================
    // 3. JOIN AN ACTIVE SESSION
    // ==========================================
    if (sub === 'dolacz' || sub === 'd') {
      const session = client.stockSessions.get(threadId);
      if (!session) {
        await message.reply('❌ Brak aktywnej sesji giełdy. Wpisz **!gielda start**, aby utworzyć lobby.');
        return;
      }

      if (session.state !== 'lobby') {
        await message.reply('❌ Zapisy do lobby zostały już zamknięte.');
        return;
      }

      if (session.participants.has(message.author.id)) {
        await message.reply('❌ Już dołączyłeś do tej sesji giełdy.');
        return;
      }

      if (session.participants.size >= 8) {
        await message.reply('❌ Lobby jest pełne (maksymalnie 8 graczy).');
        return;
      }

      session.participants.add(message.author.id);
      await message.reply(`✅ Pomyślnie dołączyłeś do sesji giełdy! (**${session.participants.size}/8**).`);
      return;
    }

    // ==========================================
    // 4. INVEST FUNDS
    // ==========================================
    if (sub === 'inwestuj' || sub === 'i') {
      const session = client.stockSessions.get(threadId);
      if (!session) {
        await message.reply('❌ Brak aktywnej sesji giełdy.');
        return;
      }

      if (session.state !== 'investing') {
        await message.reply('❌ Runda inwestowania nie jest aktywna.');
        return;
      }

      if (!session.participants.has(message.author.id)) {
        await message.reply('❌ Nie uczestniczysz w tej sesji giełdy (musiałeś zapisać się w lobby).');
        return;
      }

      if (session.investments.has(message.author.id)) {
        await message.reply('❌ Już zainwestowałeś w tej rundzie. Nie można zmienić decyzji ani kwoty.');
        return;
      }

      const amountStr = args[1];
      const assetStr = args[2];

      if (!amountStr || !assetStr) {
        await message.reply('❌ Użyj: **!gielda inwestuj <kwota> <bank/srebro/zloto/diamenty>**');
        return;
      }

      const normalizedAsset = normalizeAsset(assetStr);
      if (!normalizedAsset) {
        await message.reply('❌ Nieznane aktywo. Wybierz: **bank**, **srebro**, **zloto** lub **diamenty**.');
        return;
      }

      const investResult = await withData(store => {
        const user = createUser(message.author.id, store.users);
        const bet = resolveAmount(amountStr, user.balance);

        if (!bet || bet <= 0) return { error: '❌ Podaj poprawną kwotę inwestycji.' };
        if (bet > user.balance) return { error: '❌ Brak wystarczających środków w portfelu.' };

        user.balance -= bet;
        return { success: true, bet };
      });

      if (investResult.error) {
        await message.reply(investResult.error);
        return;
      }

      session.investments.set(message.author.id, {
        amount: investResult.bet,
        asset: normalizedAsset
      });

      await message.reply(`✅ Pomyślnie zainwestowałeś **${formatCurrency(investResult.bet)}** w **${displayAsset(normalizedAsset)}**!`);
      return;
    }

    await message.reply('❌ Nieznana podkomenda. Użyj: **!gielda start**, **!gielda dolacz**, **!gielda inwestuj <kwota> <aktywo>** lub samo **!gielda**.');
  }
};
