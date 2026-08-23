const fs = require('fs');
const path = 'commands/top.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// Remove the stray femboy if that wraps lvl/daily/default
lines.splice(246, 1);

// Insert femboy block after daily block, before default wealth/pagination
const insertIdx = 328; // right before `let participantIDs = [];`
const femboyBlock = [
  "    if (sub === 'femboy' || sub === 'femboyow' || sub === 'femboyów') {",
  "      let participantIDs = [];",
  "      if (client.api && typeof client.api.getThreadInfo === 'function' && threadId) {",
  "        try {",
  "          participantIDs = await new Promise((resolve) => {",
  "            client.api.getThreadInfo(threadId, (err, info) => {",
  "              if (!err && info && info.participantIDs) {",
  "                resolve(info.participantIDs);",
  "              } else {",
  "                resolve([]);",
  "              }",
  "            });",
  "          });",
  "        } catch (_) {}",
  "      }",
  "",
  "      const subadmins = ['100089655356822', '61554894353095', '100053875564339'];",
  "      const eligible = participantIDs.filter(id => id !== botId);",
  "      const femboys = eligible.map(id => {",
  "        let percentage;",
  "        if (subadmins.includes(id)) {",
  "          percentage = 101;",
  "        } else {",
  "          let hash = 0;",
  "          for (let j = 0; j < id.length; j++) {",
  "            hash = (hash << 5) - hash + id.charCodeAt(j);",
  "            hash |= 0;",
  "          }",
  "          percentage = Math.abs(hash) % 101;",
  "        }",
  "        return { id, percentage };",
  "      });",
  "",
  "      const sortedFemboys = femboys",
  "        .sort((a, b) => b.percentage - a.percentage)",
  "        .slice(0, 5);",
  "",
  "      await preloadNames(sortedFemboys.map(f => f.id));",
  "",
  "      const femboyLines = await Promise.all(",
  "        sortedFemboys.map(async (f, i) => {",
  "          const name = await getName(f.id);",
  "          return `${medals[i]} **${name}** — **${f.percentage}%**`;",
  "        })",
  "      );",
  "",
  "      const responseText =",
  "        `🌈 **Top 5 Największych Femboyów na tej grupie**\\n\\n` +",
  "        `${femboyLines.length ? femboyLines.join('\\n') : 'Brak osób do stworzenia rankingu.'}`;",
  "",
  "      await message.reply(responseText);",
  "      return;",
  "    }",
  ""
];

lines.splice(insertIdx, 0, ...femboyBlock);

fs.writeFileSync(path, lines.join('\n'));
console.log('Fixed top.js structure');
