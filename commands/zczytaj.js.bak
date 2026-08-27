const fs = require('fs');
const path = require('path');
const { withData, createUser } = require('../utils/storage');
const { DATA_DIR } = require('../utils/storage');

function getThreadHistoryPage(api, threadID, amount, timestamp) {
  return new Promise((resolve) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[ZCZYTAJ] getThreadHistory timed out for thread ${threadID}`);
        resolve(null);
      }
    }, 120000);

    api.getThreadHistory(threadID, amount, timestamp, (err, history) => {
      clearTimeout(timeout);
      if (completed) return;
      completed = true;
      if (err) {
        console.error('[ZCZYTAJ] getThreadHistory error:', err);
        return resolve(null);
      }
      resolve(history || []);
    });
  });
}

module.exports = {
  name: 'zczytaj',
  aliases: ['zestaw', 'przeskanuj'],
  async execute(client, message, args) {
    if (message.author.id !== '100060812419294') {
      await message.reply('❌ Ta komenda jest dostępna tylko dla twórcy bota.');
      return;
    }

    const days = Math.min(30, Math.max(1, Number(args[0]) || 4));
    const targetThreadId = '24956371943963938';
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const threads = Array.from(client.activeThreadIds || []);
    console.log(`[ZCZYTAJ] Aktywne wątki: ${threads.length}`);
    if (!threads.length) {
      await message.reply('❌ Bot nie jest w żadnych grupach.');
      return;
    }

    console.log(`[ZCZYTAJ] Rozpoczynam skanowanie. Grupy: ${threads.length}, dni: ${days}, cutoff: ${new Date(cutoff).toISOString()}`);
    await message.reply(`🔍 **Rozpoczynam skanowanie ${threads.length} grup...**\nSzukam !bal, !eq, !pfp, !gang, !top, !daily, !work, !crime, !rob oraz odpowiedzi bota z ostatnich ${days} dni.\nLimit: 10 000 wiadomości/grupę. To może zająć kilka minut.`);

    const matched = [];
    const allMessages = [];
    let totalScanned = 0;
    let totalGroups = 0;
    const seenIds = new Set();
    const COMMANDS = ['!bal', '!eq', '!pfp', '!gang', '!top', '!daily', '!work', '!crime', '!rob', '!equip'];
    const MAX_PER_GROUP = 10000;
    const BATCH_SIZE = 200;
    const DELAY_MS = 1500;
    const botResponsesLookup = new Map();
    const groupStats = [];

    try {

    for (const threadId of threads) {
      if (threadId === message.author.id) continue;
      totalGroups++;

      let oldestTimestamp = null;
      let keepFetching = true;
      let fetchError = false;
      let groupScanned = 0;
      const threadMessages = [];

      while (keepFetching && groupScanned < MAX_PER_GROUP) {
        const batchSize = Math.min(500, MAX_PER_GROUP - groupScanned);
        const history = await getThreadHistoryPage(client.api, threadId, batchSize, oldestTimestamp);
        if (history === null) {
          fetchError = true;
          break;
        }
        if (history.length === 0) break;

        groupScanned += history.length;
        totalScanned += history.length;
        let pageOldest = Infinity;

        for (const msg of history) {
          const ts = Number(msg.timestamp);
          if (ts < pageOldest) pageOldest = ts;

          if (ts < cutoff) {
            keepFetching = false;
            break;
          }

          const msgId = msg.messageID ? String(msg.messageID) : null;
          if (msgId && seenIds.has(msgId)) continue;
          if (msgId) seenIds.add(msgId);

          threadMessages.push({
            timestamp: new Date(ts).toISOString(),
            ts,
            senderID: msg.senderID ? String(msg.senderID) : null,
            body: (msg.body || '').trim(),
            threadId,
            replyTo: msg.replyTo ? String(msg.replyTo) : null,
            messageID: msgId
          });
        }

        if (!keepFetching) break;

        if (pageOldest !== Infinity && pageOldest === oldestTimestamp) {
          break;
        }
        oldestTimestamp = pageOldest !== Infinity && !isNaN(pageOldest) ? pageOldest - 1 : null;
        if (!oldestTimestamp) break;

        await new Promise(resolve => setTimeout(resolve, 800));
      }

      console.log(`[ZCZYTAJ] Grupa ${threadId}: zeskanowano ${groupScanned} wiadomości.`);
      threadMessages.sort((a, b) => a.ts - b.ts);
      allMessages.push(...threadMessages);
    }

    const botId = typeof client.api.getCurrentUserID === 'function' ? String(client.api.getCurrentUserID()) : '61560227271099';
    const userCommands = allMessages.filter(m => {
      const lower = (m.body || '').toLowerCase();
      const firstWord = lower.split(/\s+/)[0];
      return m.senderID && m.senderID !== botId && COMMANDS.includes(firstWord);
    });

    const botResponses = allMessages.filter(m => m.senderID === botId);
    const threadResponsesMap = new Map();
    for (const r of botResponses) {
      if (!threadResponsesMap.has(r.threadId)) threadResponsesMap.set(r.threadId, []);
      threadResponsesMap.get(r.threadId).push(r);
    }

    for (const cmd of userCommands) {
      const cmdTime = cmd.ts;
      const sameThreadResponses = (threadResponsesMap.get(cmd.threadId) || []).filter(r => r.ts > cmdTime && r.ts < cmdTime + 10000);
      const response = sameThreadResponses.length > 0 ? sameThreadResponses[0].body : null;

      const firstWord = cmd.body.toLowerCase().split(/\s+/)[0];
      const type = firstWord === '!gang' ? 'gang' : (['!bal', '!eq', '!pfp', '!equip'].includes(firstWord) ? 'user_stats' : 'other');

      matched.push({
        timestamp: cmd.timestamp,
        type,
        userId: cmd.senderID,
        userName: cmd.senderID,
        command: firstWord,
        body: cmd.body,
        response: response || null,
        threadId: cmd.threadId,
        replyTo: cmd.replyTo || null
      });
    }

    if (matched.length === 0) {
      await message.reply(`⚠️ Nie znaleziono wpisów z !bal, !eq, !pfp, !gang w ostatnich ${days} dniach.\nPrzeskanowano ${totalGroups} grup, ${totalScanned} wiadomości.`);
      return;
    }

    const output = {
      generatedAt: new Date().toISOString(),
      rangeDays: days,
      cutoff: new Date(cutoff).toISOString(),
      totalGroups,
      totalScanned,
      totalEntries: matched.length,
      entries: matched.map(e => ({
        timestamp: e.timestamp,
        type: e.type,
        userId: e.userId,
        userName: e.userName,
        command: e.command,
        body: e.body,
        response: e.response || null,
        threadId: e.threadId,
        replyTo: e.replyTo
      }))
    };

    const fileName = `zczytaj_${Date.now()}.json`;
    const filePath = path.join(DATA_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');

    const userStats = matched.filter(e => ['!bal', '!eq', '!pfp', '!equip'].includes(e.command)).length;
    const gangEntries = matched.filter(e => e.command === '!gang').length;
    const topEntries = matched.filter(e => e.command === '!top').length;
    const dailyEntries = matched.filter(e => e.command === '!daily').length;
    const workEntries = matched.filter(e => e.command === '!work').length;
    const crimeEntries = matched.filter(e => e.command === '!crime').length;
    const robEntries = matched.filter(e => e.command === '!rob').length;
    const withResponse = matched.filter(e => e.response).length;

    try {
      await message.reply(`📦 Znaleziono ${matched.length} wpisów w ${totalGroups} grupach:\n• Statystyki (!bal/!eq/!pfp): ${userStats}\n• Gang (!gang): ${gangEntries}\n• Top (!top): ${topEntries}\n• Daily (!daily): ${dailyEntries}\n• Work/Crime/Rob: ${workEntries + crimeEntries + robEntries}\n• Odpowiedzi bota: ${withResponse}\n\nWysyłam plik...`);
      await new Promise((resolve, reject) => {
        client.api.sendMessage({
          body: `📦 Zczytano ${matched.length} wpisów z ${totalGroups} grup (${totalScanned} wiadomości).\n!bal/!eq/!pfp: ${userStats}\n!gang: ${gangEntries}\n!top: ${topEntries}\n!daily: ${dailyEntries}\n!work/!crime/!rob: ${workEntries + crimeEntries + robEntries}\nOdpowiedzi bota: ${withResponse}.`,
          attachment: fs.createReadStream(filePath)
        }, targetThreadId, (err) => {
          try { fs.unlinkSync(filePath); } catch {}
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      await message.reply(`❌ Błąd wysyłania pliku: ${err.message}`);
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
};
