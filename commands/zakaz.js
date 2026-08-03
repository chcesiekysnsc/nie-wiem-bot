const { withData } = require('../utils/storage');
const config = require('../config/config');

module.exports = {
  name: 'zakaz',
  aliases: [],
  async execute(client, message, args) {
    const threadId = message.threadID || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko w konwersacjach grupowych.');
      return;
    }

    const senderId = message.author.id;
    const isBotAdmin = config.admins.includes(senderId);

    let isGroupAdmin = false;
    if (!isBotAdmin && client.api) {
      try {
        const info = await new Promise((resolve) => {
          client.api.getThreadInfo(threadId, (err, ret) => {
            if (err) resolve(null);
            else resolve(ret);
          });
        });
        const adminIDs = (info?.adminIDs || []).map(admin => {
          if (typeof admin === 'object' && admin !== null) {
            return String(admin.id || admin.userID || '').trim();
          }
          return String(admin).trim();
        }).filter(Boolean);
        isGroupAdmin = adminIDs.includes(senderId);
      } catch (e) {
        // ignore
      }
    }

    if (!isBotAdmin && !isGroupAdmin) {
      await message.reply('❌ Tylko administratorzy grupy lub bota mogą używać tej komendy.');
      return;
    }

    const sub = String(args[0] || '').toLowerCase().trim();

    if (sub === 'ekonomia' || sub === 'ekonomiczne') {
      const result = await withData(store => {
        store.profiles.threadSettings = store.profiles.threadSettings || {};
        store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
        store.profiles.threadSettings[threadId].blockEconomy = !store.profiles.threadSettings[threadId].blockEconomy;
        return store.profiles.threadSettings[threadId].blockEconomy;
      });

      if (result) {
        await message.reply('🔒 **Zablokowano wszystkie komendy ekonomiczne** na tej grupie.');
      } else {
        await message.reply('🔓 **Odblokowano komendy ekonomiczne** na tej grupie.');
      }
      return;
    }

    if (sub === 'powiadomienia' || sub === 'ogłoszenia' || sub === 'broadcast') {
      const result = await withData(store => {
        store.profiles.threadSettings = store.profiles.threadSettings || {};
        store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
        store.profiles.threadSettings[threadId].blockNotifications = !store.profiles.threadSettings[threadId].blockNotifications;
        return store.profiles.threadSettings[threadId].blockNotifications;
      });

      if (result) {
        await message.reply('🔕 **Zablokowano globalne powiadomienia** na tej grupie.');
      } else {
        await message.reply('🔔 **Odblokowano globalne powiadomienia** na tej grupie.');
      }
      return;
    }

    await message.reply(
      `⚙️ **Zakazy na grupie:**\n\n` +
      `• \`!zakaz economia\` — blokuje/odblokowuje wszystkie komendy ekonomiczne\n` +
      `• \`!zakaz powiadomienia\` — blokuje/odblokowuje WSZYSTKIE globalne powiadomienia (podatki, loteria, eventy, gry, reminder, multimecz, reakcje, flagi itd.)`
    );
  }
};
