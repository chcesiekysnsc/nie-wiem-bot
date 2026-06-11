const config = require('../config/config');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { formatCurrency, refreshBadges, ensureInventoryRecord, resolveAmount } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

module.exports = {
  name: 'admadd',
  aliases: ['addmoney'],
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply({
        embeds: [errorEmbed('Brak dostepu', 'Ta komenda jest dostepna tylko dla adminow.')]
      });
      return;
    }

    let targetId = message.author.id;
    let targetName = message.author.username || `Uzytkownik_${targetId.slice(-6)}`;
    let isSelf = true;
    let amount = null;

    const mentioned = message.mentions.users.first();
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || `Uzytkownik_${targetId.slice(-6)}`;
      isSelf = false;

      for (const arg of args) {
        const resolved = resolveAmount(arg, 999999999999);
        if (resolved && resolved > 0) {
          amount = resolved;
          break;
        }
      }
    } else {
      let idIndex = -1;
      for (let i = 0; i < args.length; i++) {
        if (/^\d{10,18}$/.test(args[i])) {
          idIndex = i;
          break;
        }
      }

      if (idIndex !== -1) {
        targetId = args[idIndex];
        targetName = `Uzytkownik_${targetId.slice(-6)}`;
        if (client.userNames && client.userNames.has(targetId)) {
          targetName = client.userNames.get(targetId);
        }
        isSelf = false;

        for (let i = 0; i < args.length; i++) {
          if (i !== idIndex) {
            const resolved = resolveAmount(args[i], 999999999999);
            if (resolved && resolved > 0) {
              amount = resolved;
              break;
            }
          }
        }
      } else {
        amount = resolveAmount(args[0], 999999999999);
      }
    }

    if (!amount || amount <= 0) {
      await message.reply({
        embeds: [errorEmbed('Bledne uzycie', 'Uzyj: **!admadd <kwota> [@oznaczenie/id]** lub **!admadd [@oznaczenie/id] <kwota>**')]
      });
      return;
    }

    const result = await withData(store => {
      const user = createUser(targetId, store.users);
      const inventory = ensureInventoryRecord(store.inventory, targetId);

      user.balance += amount;
      refreshBadges(user, inventory);

      return { balance: user.balance };
    });

    const targetDesc = isSelf ? 'Twojego portfela' : `portfela użytkownika **${targetName}**`;
    await message.reply({
      embeds: [successEmbed('Admin: Dodano kase', `Dodano ${formatCurrency(amount)} do ${targetDesc}.\nNowe saldo: ${formatCurrency(result.balance)}`)]
    });

    // Powiadomienie na grupę administratorów
    try {
      const adminGroupId = config.adminGroupId || '5277347745703557';
      const adminName = message.author.username || message.author.profile?.name || `Admin_${message.author.id.slice(-6)}`;
      const actionText = isSelf ? `Dodał sobie` : `Dodał graczowi **${targetName}** (ID: ${targetId})`;
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
