const config = require('../config/config');
const { formatCurrency } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const BODYGUARDS_ORDER = ['kacper_rzerzonczka', 'tony_montana_smietana', 'kacper_bysiec'];

function getBodyguardDef(id) {
  return config.economy.bodyguards?.[id];
}

function renderBodyguardList(userBodyguards) {
  const bodyguards = config.economy.bodyguards || {};
  let text = '🛡️ **OCHRONIARZE (SYSTEM OCHRONIARZY)**\n';
  text += 'Kup ochroniarza, aby automatycznie używać bomb/klodki!\n';
  text += '⚠️ Możesz zatrudnić tylko **1 ochroniarza**.\n\n';
  text += '📋 **Oferta ochroniarzy:**\n';

  let i = 1;
  for (const id of BODYGUARDS_ORDER) {
    const def = getBodyguardDef(id);
    if (!def) continue;

    const owned = userBodyguards.includes(id);
    const salaryPct = Math.round(def.salaryPercent * 100);
    const noCostPct = Math.round(def.noCostChance * 100);
    const robDefensePct = def.robDefenseBonus ? Math.round(def.robDefenseBonus * 100) : 0;

    text += `**${i}. ${def.stars} ${def.name}**\n`;
    text += `   ↳ Cena: **${formatCurrency(def.cost)}**\n`;
    text += `   ↳ Pobiera: **${salaryPct}%** wypłaty z firmy\n`;
    text += `   ↳ Używa bomby/klodki co: **${def.useIntervalMinutes} minut**\n`;
    text += `   ↳ Szansa na darmowe użycie: **${noCostPct}%**\n`;
    if (robDefensePct > 0) {
      text += `   ↳ Zmniejsza szanse na rob o: **-${robDefensePct}%**\n`;
    }
    if (def.givesFreeKlodkaChance) {
      const freeKlodkaPct = Math.round(def.givesFreeKlodkaChance * 100);
      text += `   ↳ Szansa na darmową kłódkę przy obronie: **${freeKlodkaPct}%**\n`;
    }
    if (def.givesBrownPackageOnDefense) {
      text += `   ↳ Ochroni przed napadem: **Daje brązową paczkę**\n`;
    }
    text += owned ? `   ↳ Status: ✅ **POSIADASZ**\n\n` : `\n`;
    i++;
  }

  text += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  text += 'Kup ochroniarza wpisując: **!ochroniarze <numer>**\n';
  text += 'Sprzedaj ochroniarza: **!ochroniarze sprzedaj**';
  return text;
}

module.exports = {
  name: 'ochroniarze',
  aliases: ['ochroniarz', 'bodyguard'],
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();

    if (!action) {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);
        return { bodyguards: user.bodyguards || [] };
      });

      await message.reply(renderBodyguardList(result.bodyguards));
      return;
    }

    if (action === 'sprzedaj' || action === 'sell') {
      const result = await withData(store => {
        const user = createUser(message.author.id, store.users);

        if (!user.bodyguards || user.bodyguards.length === 0) {
          return { error: '❌ Nie posiadasz żadnego ochroniarza do sprzedania!' };
        }

        let totalRefund = 0;
        const bodyguardsDef = config.economy.bodyguards || {};
        for (const bgId of user.bodyguards) {
          const def = getBodyguardDef(bgId);
          if (def) {
            totalRefund += Math.floor(def.cost * 0.5);
          }
        }

        user.balance += totalRefund;
        user.bodyguards = [];

        return { success: true, totalRefund, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💸 Sprzedano ochroniarza za **${formatCurrency(result.totalRefund)}** (50% ceny zakupu).\n💰 Twój portfel: **${formatCurrency(result.balance)}**.`);
      return;
    }

    const bodyguardNum = parseInt(action, 10);
    const bodyguardsDef = config.economy.bodyguards || {};
    if (isNaN(bodyguardNum) || bodyguardNum < 1 || bodyguardNum > BODYGUARDS_ORDER.length) {
      await message.reply(`❌ Podaj numer ochroniarza 1-${BODYGUARDS_ORDER.length}. Napisz **!ochroniarze**, aby zobaczyć listę.`);
      return;
    }

    const bodyguardId = BODYGUARDS_ORDER[bodyguardNum - 1];
    const bodyguardDef = getBodyguardDef(bodyguardId);
    if (!bodyguardDef) {
      await message.reply('❌ Nie znaleziono takiego ochroniarza!');
      return;
    }

    const result = await withData(store => {
      const user = createUser(message.author.id, store.users);

      if (!user.company && !user.company2) {
        return { error: '❌ Musisz najpierw posiadać firmę, aby zatrudnić ochroniarza! Kup firmę za pomocą **!firma kup <nr>**.' };
      }

      if (user.bodyguards && user.bodyguards.length >= 1) {
        return { error: '❌ Możesz zatrudnić tylko 1 ochroniarza!' };
      }

      if (user.bodyguards && user.bodyguards.includes(bodyguardId)) {
        return { error: `❌ Już zatrudniłeś **${bodyguardDef.name}**!` };
      }

      if (user.balance < bodyguardDef.cost) {
        return { error: `❌ Brak wystarczających środków w portfelu! Cena to **${formatCurrency(bodyguardDef.cost)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
      }

      user.balance -= bodyguardDef.cost;
      user.bodyguards = user.bodyguards || [];
      user.bodyguards.push(bodyguardId);

      return { success: true, bodyguardDef, balance: user.balance };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    await message.reply(`🎉 Pomyślnie zatrudniono **${result.bodyguardDef.stars} ${result.bodyguardDef.name}** za **${formatCurrency(result.bodyguardDef.cost)}**!\n💰 Pozostało w portfelu: **${formatCurrency(result.balance)}**.\n💡 Ochroniarz będzie automatycznie używał bomb/klodki co ${result.bodyguardDef.useIntervalMinutes} minut.`);
  }
};
