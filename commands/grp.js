const config = require('../config/config');
const { formatCurrency } = require('../utils/economy');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'grp',
  aliases: ['groupinfo'],
  async execute(client, message, args) {
    const threadId = message.threadID || message.rawEvent?.threadID;
    
    if (!threadId) {
      await message.reply('❌ Nie można określić ID tej grupy.');
      return;
    }

    if (!client.api || typeof client.api.getThreadInfo !== 'function') {
      await message.reply('❌ Brak dostępu do API Messengera.');
      return;
    }

    await message.reply('⏳ Pobieranie informacji o grupie...');

    try {
      const info = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        client.api.getThreadInfo(threadId, (err, ret) => {
          clearTimeout(timer);
          if (err) resolve(null);
          else resolve(ret);
        });
      });

      if (!info) {
        await message.reply('❌ Nie udało się pobrać informacji o grupie.');
        return;
      }

      const participantIDs = info.participantIDs || [];
      const adminIDs = info.adminIDs || [];
      const botID = typeof client.api.getCurrentUserID === 'function' ? client.api.getCurrentUserID() : null;

      // Pobieranie danych z bazy
      const groupData = await withData(store => {
        const blacklisted = store.profiles.blacklistedGroups || [];
        const isBanned = blacklisted.includes(threadId);
        
        const defaultUser = config.economy.defaultUser || { balance: 5000, bank: 10000 };
        let totalMoney = 0;
        let maleCount = 0;
        let femaleCount = 0;
        
        for (const pId of participantIDs) {
          const u = store.users[pId] || defaultUser;
          totalMoney += (u.balance || 0) + (u.bank || 0);
          
          const profile = store.profiles[pId];
          if (profile && profile.gender) {
            if (profile.gender.toLowerCase() === 'male') maleCount++;
            else if (profile.gender.toLowerCase() === 'female') femaleCount++;
          }
        }

        // Statystyki grupy
        const groupStats = store.groupStats?.[threadId] || {};
        const visibleMsgs = groupStats.visibleMessages || 0;
        const processedMsgs = groupStats.processedMessages || 0;
        const commandsExecuted = groupStats.commandsExecuted || 0;
        const mentionsCount = groupStats.mentionsCount || 0;
        const firstUse = groupStats.firstUse ? new Date(groupStats.firstUse).toLocaleString('pl-PL') : 'Nieznane';

        // Odczyt ustawienia logowania usuniętych wiadomości
        const settings = store.profiles.threadSettings && store.profiles.threadSettings[threadId];
        const unsendLoggingEnabled = settings ? settings.unsendLoggingEnabled !== false : true; // domyślnie włączone

        return {
          totalMoney,
          isBanned,
          maleCount,
          femaleCount,
          visibleMsgs,
          processedMsgs,
          commandsExecuted,
          mentionsCount,
          firstUse,
          unsendLoggingEnabled
        };
      });

      const groupName = info.threadName || info.name || 'Grupa';
      const memberCount = participantIDs.length;
      const adminCount = adminIDs.length;

      let response = `👨‍👩‍👧‍👦 **Informacje o grupie ${groupName}:**\n\n`;
      response += `🆔 ID: **${threadId}**\n`;
      response += `👥 Członkowie: **${memberCount}**\n`;
      response += `👮🏻‍♂️ Administratorzy: **${adminCount}**\n`;
      response += `👨🏻 Mężczyźni: **${groupData.maleCount}**\n`;
      response += `👩🏼 Kobiety: **${groupData.femaleCount}**\n`;
      response += `💰 Łączne środki: **${formatCurrency(groupData.totalMoney)}**\n`;
      response += `🗂 Widoczne wiadomości: **${groupData.visibleMsgs.toLocaleString()}**\n`;
      response += `🗃 Przetworzone wiadomości: **${groupData.processedMsgs.toLocaleString()}**\n`;
      response += `🤖 Wykonane komendy: **${groupData.commandsExecuted.toLocaleString()}**\n`;
      response += `🐒 Liczba oznaczeń: **${groupData.mentionsCount.toLocaleString()}**\n`;
      
      const approvalStatus = (info.approvalMode === 1 || info.approvalMode === '1' || info.approvalMode === true || info.approvalMode === 'true') ? '✅ włączone' : '❌ wyłączone';
      response += `🧐 Zatwierdzanie członków: **${approvalStatus}**\n`;
      
      const restoreStatus = groupData.unsendLoggingEnabled ? '✅ włączone' : '❌ wyłączone';
      response += `👀 Przywracanie wiadomości: **${restoreStatus}**\n`;
      
      response += `🤓 Pierwsze użycie bota: **${groupData.firstUse}**\n`;

      if (info.imageSrc) {
        response += `\n🖼️ Zdjęcie profilowe: [Link](${info.imageSrc})`;
      }

      await message.reply(response);
    } catch (err) {
      console.error('[grp] Błąd:', err);
      await message.reply('❌ Wystąpił błąd podczas pobierania informacji o grupie.');
    }
  }
};
