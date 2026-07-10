const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'admadd',
  aliases: ['addmoney'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply({
        embeds: [errorEmbed('Brak dostepu', 'Ta komenda jest dostepna tylko dla twórcy bota.')]
      });
      return;
    }

    const amount = resolveAmount(args[0], 999999999999);

    if (!amount || amount <= 0) {
      await message.reply({
        embeds: [errorEmbed('Bledne uzycie', 'Uzyj: **!admadd <kwota> [@oznaczenie/id/nazwa]**')]
      });
      return;
    }

    const query = args.slice(1).join(' ').trim();

    const result = await withData(store => {
      let targetId = message.author.id;
      let targetName = message.author.username || `Uzytkownik_${targetId.slice(-6)}`;
      let isSelf = true;

      if (query) {
        const mentioned = message.mentions.users.first();
        if (mentioned) {
          targetId = mentioned.id;
          targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
          isSelf = false;
        } else if (/^\d{10,18}$/.test(query)) {
          targetId = query;
          targetName = `Uzytkownik_${targetId.slice(-6)}`;
          isSelf = false;
          if (client.userNames && client.userNames.has(targetId)) {
            targetName = client.userNames.get(targetId);
          }
        } else {
          const cleanQuery = query.toLowerCase().replace(/^@/, '');
          let foundId = null;
          let foundName = null;

          if (client.userNames) {
            for (const [uid, name] of client.userNames.entries()) {
              if (String(name).toLowerCase().includes(cleanQuery)) {
                foundId = uid;
                foundName = name;
                break;
              }
            }
          }

          if (!foundId && store.users) {
            for (const [uid, user] of Object.entries(store.users)) {
              if (user && user.name && String(user.name).toLowerCase().includes(cleanQuery)) {
                foundId = uid;
                foundName = user.name;
                break;
              }
            }
          }

          if (foundId) {
            targetId = foundId;
            targetName = foundName;
            isSelf = false;
          } else {
            return { error: `❌ Nie odnaleziono użytkownika pasującego do: **${query}**` };
          }
        }
      }

      const user = createUser(targetId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, targetId);

      user.balance += amount;
      refreshBadges(user, inventory);

      return { balance: user.balance, targetId, targetName, isSelf };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const targetDesc = result.isSelf ? 'Twojego portfela' : `portfela użytkownika **${result.targetName}**`;
    await message.reply({
      embeds: [successEmbed('Admin: Dodano kase', `Dodano ${formatCurrency(amount)} do ${targetDesc}.\nNowe saldo: ${formatCurrency(result.balance)}`)]
    });

    try {
      const adminGroupId = config.adminGroupId || '5277347745703557';
      const adminName = message.author.username || message.author.profile?.name || `Admin_${message.author.id.slice(-6)}`;
      const actionText = result.isSelf ? `Dodał sobie` : `Dodał graczowi **${result.targetName}** (ID: ${result.targetId})`;
      const notifyMsg = `🔔 **UŻYCIE KOMENDY ADMINA** 🔔\n` +
                        `👤 Kto: **${adminName}** (ID: ${message.author.id})\n` +
                        `💸 Akcja: ${actionText} **${formatCurrency(amount)}**`;
      if (client.api && typeof client.api.sendMessage === 'function') {
        client.api.sendMessage(notifyMsg, adminGroupId);
      }
    } catch (err) {
      console.error('[ADMADD NOTIFICATION] Failed to notify admin group:', err);
    }
  }
};
