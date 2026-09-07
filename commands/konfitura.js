const { formatCurrency, msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

async function resolveName(client, userId) {
  if (typeof client.resolveUserName === 'function') {
    return await client.resolveUserName(userId);
  }
  return (client.userNames && client.userNames.get(userId)) || `Użytkownik_${userId.slice(-6)}`;
}

const DRUG_NAMES = {
  marihuana: '🌿 Marihuana',
  amfetamina: '🧪 Amfetamina',
  kokaina: '❄️ Kokaina'
};

module.exports = {
  name: 'konfitura',
  aliases: ['konfident', 'kapus', 'donos'],
  description: 'Zgłoś gracza na policję za uprawę narkotyków, zwiększając jego szanse na wpadkę.',
  async execute(client, message, args) {
    const authorId = message.author.id;
    const now = Date.now();

    // 1. Identify Target
    let targetId = null;
    let targetName = 'Cel';

    const mentioned = message.mentions && message.mentions.users && message.mentions.users.first ? message.mentions.users.first() : null;
    if (mentioned) {
      targetId = mentioned.id;
      targetName = mentioned.username || await resolveName(client, targetId);
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = args[0];
      targetName = await resolveName(client, targetId);
    }

    if (!targetId) {
      await message.reply('❌ Oznacz osobę, którą chcesz podkablować! Użycie: **!konfitura <@oznaczenie>** lub **!konfitura <ID>**. Przykład: **!konfitura @Jan**');
      return;
    }

    if (targetId === authorId) {
      await message.reply('❌ Nie możesz złożyć donosu na samego siebie!');
      return;
    }

    if (client.user && targetId === client.user.id) {
      await message.reply('❌ Nie możesz złożyć donosu na bota!');
      return;
    }

    // 2. Execute report and validate storage
    const result = await withData(async (store) => {
      const user = createUser(authorId, store.users);

      // Check jail
      if (user.jailUntil && user.jailUntil > now) {
        return { error: `❌ Jesteś w więzieniu! Odzyskasz wolność za **${msToReadable(user.jailUntil - now)}**.` };
      }

      // Check konfident lockout (12h)
      if (user.konfidentUntil && user.konfidentUntil > now) {
        return { error: `❌ Masz aktywną blokadę konfidenta! Możesz ponownie współpracować z organami za **${msToReadable(user.konfidentUntil - now)}**.` };
      }

      if (!store.profiles) store.profiles = {};
      if (!store.profiles.narkotyki) store.profiles.narkotyki = {};
      if (!store.profiles.konfidentReports) store.profiles.konfidentReports = {};

      // Check if target is already under active police surveillance
      if (store.profiles.konfidentReports[targetId]) {
        return { error: '⚠️ Ta osoba jest już objęta obserwacją policyjną przez inne zgłoszenie!' };
      }

      const targetData = store.profiles.narkotyki[targetId] || { plantacje: [], magazyn: {} };
      const counts = { marihuana: 0, amfetamina: 0, kokaina: 0 };

      if (Array.isArray(targetData.plantacje)) {
        targetData.plantacje.forEach(p => {
          if (counts[p.type] !== undefined) counts[p.type] += 1;
        });
      }

      if (targetData.magazyn) {
        for (const [k, v] of Object.entries(targetData.magazyn)) {
          if (counts[k] !== undefined) counts[k] += (Number(v) || 0);
        }
      }

      const totalDrugs = counts.marihuana + counts.amfetamina + counts.kokaina;
      if (totalDrugs <= 0) {
        return { error: '❌ Cel nie prowadzi obecnie żadnych upraw ani nie posiada towaru w magazynie! Policja odrzuciła Twoje zgłoszenie.' };
      }

      // Determine dominant drug:
      // Marihuana: +8% (0.08)
      // Amfetamina: +5% (0.05)
      // Kokaina: +3% (0.03)
      let dominantType = 'marihuana';
      let dominantBonus = 0.08;
      let maxCount = counts.marihuana;

      if (counts.amfetamina > maxCount) {
        dominantType = 'amfetamina';
        dominantBonus = 0.05;
        maxCount = counts.amfetamina;
      }

      if (counts.kokaina > maxCount) {
        dominantType = 'kokaina';
        dominantBonus = 0.03;
        maxCount = counts.kokaina;
      }

      // Lockout caller for 12 hours from crime and drug activities
      const lockoutMs = 12 * 3600 * 1000;
      user.konfidentUntil = now + lockoutMs;

      // Save active surveillance report on target
      store.profiles.konfidentReports[targetId] = {
        snitchId: authorId,
        extraRisk: dominantBonus,
        dominantType: dominantType,
        reportedAt: now,
        threadId: message.threadId || null
      };

      return {
        success: true,
        dominantType,
        dominantBonus,
        maxCount,
        lockoutMs
      };
    });

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    const bonusPct = Math.round(result.dominantBonus * 100);
    let replyMsg = `👮‍♂️ **ZŁOŻONO DONOS NA POLICJĘ (KONFITURA)!** 👮‍♂️\n\n`;
    replyMsg += `Doniosłeś na gracza **${targetName}**!\n\n`;
    replyMsg += `🔍 **Wyniki śledztwa kryminalnych:**\n`;
    replyMsg += `   • Wykryty dominujący towar: **${DRUG_NAMES[result.dominantType]}** (łącznie: **${result.maxCount}** szt.)\n`;
    replyMsg += `   • Zwiększone ryzyko nalotu policji: **+${bonusPct}%** przy najbliższej sprzedaży towaru!\n\n`;
    replyMsg += `⚖️ **Konsekwencje współpracy z policją:**\n`;
    replyMsg += `   • 🔒 **Blokada 12h:** Przez 12 godzin nie możesz używać **!crime** ani uprawiać/zbierać narkotyków (**!narkotyki**).\n`;
    replyMsg += `   • 💰 **Nagroda (50%):** Jeśli policja go nakryje, otrzymasz **50% wartości, za ile miał sprzedać narkotyki**!\n`;
    replyMsg += `   • 💸 **Kara (30%):** Jeśli cel przechytrzy nalot, zapłacisz **30% kwoty, za ile sprzedano narkotyki** (kara za bezpodstawne wezwanie) oraz 12h bana na donosy!`;

    await message.reply(replyMsg);
  }
};
