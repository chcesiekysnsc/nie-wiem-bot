const { formatCurrency } = require('../utils/economy');
const { withData } = require('../utils/storage');

module.exports = {
  name: 'sojusze',
  aliases: ['dyplomacja', 'gangsojusze'],
  async execute(client, message, args) {
    const result = await withData(store => {
      store.profiles.gangs = store.profiles.gangs || {};
      const user = store.users[message.author.id];
      if (!user || !user.gangId || !store.profiles.gangs[user.gangId]) {
        return { notInGang: true };
      }

      const myGangId = user.gangId;
      const myGang = store.profiles.gangs[myGangId];

      // Resolve active alliances
      const activeAlliances = (myGang.alliances || []).map(id => {
        const g = store.profiles.gangs[id];
        return g ? g.name : null;
      }).filter(Boolean);

      // Resolve received alliance requests (other gangs proposed to us)
      const receivedRequests = (myGang.allianceRequests || []).map(id => {
        const g = store.profiles.gangs[id];
        return g ? g.name : null;
      }).filter(Boolean);

      // Resolve sent proposals (other gangs where our ID is in their requests)
      const sentProposals = [];
      for (const [id, g] of Object.entries(store.profiles.gangs)) {
        if (id === myGangId) continue;
        if (g.allianceRequests && g.allianceRequests.includes(myGangId)) {
          sentProposals.push(g.name);
        }
      }

      return {
        notInGang: false,
        myGangName: myGang.name,
        activeAlliances,
        receivedRequests,
        sentProposals
      };
    });

    if (result.notInGang) {
      await message.reply('❌ Nie należysz do żadnego gangu.');
      return;
    }

    let msg = `🤝 **DYPLOMACJA GANGU: ${result.myGangName.toUpperCase()}** 🤝\n\n`;

    // 1. Aktywne sojusze
    const alliesStr = result.activeAlliances.length > 0
      ? result.activeAlliances.map(name => `• **${name}**`).join('\n')
      : '• *Brak aktywnych sojuszy*';
    msg += `🤝 **Aktywne sojusze:**\n${alliesStr}\n\n`;

    // 2. Otrzymane prośby
    const receivedStr = result.receivedRequests.length > 0
      ? result.receivedRequests.map(name => `• **${name}** (wpisz *!gang sojusz ${name}* aby zaakceptować)`).join('\n')
      : '• *Brak otrzymanych próśb*';
    msg += `🔔 **Otrzymane prośby o sojusz:**\n${receivedStr}\n\n`;

    // 3. Wysłane propozycje
    const sentStr = result.sentProposals.length > 0
      ? result.sentProposals.map(name => `• **${name}**`).join('\n')
      : '• *Brak wysłanych propozycji*';
    msg += `⌛ **Wysłane propozycje (oczekujące):**\n${sentStr}`;

    await message.reply(msg);
  }
};
