const fs = require('fs');
const path = 'commands/top.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// Find key line indices (0-based)
const femboyStart = lines.findIndex(l => l.includes("if (sub === 'femboy'"));
const lvlStart = lines.findIndex(l => l.includes("if (sub === 'lvl' || sub === 'poziom'"));
const dailyStart = lines.findIndex(l => l.includes("if (sub === 'daily' || sub === 'dzienny')"));
const defaultStart = lines.findIndex(l => l.includes('const { globalTop, groupMembers, showIds, myRank, totalPlayers } = await withData(store => {')) && lines[lvlStart - 1].includes('return;');

console.log('femboyStart:', femboyStart + 1);
console.log('lvlStart:', lvlStart + 1);
console.log('dailyStart:', dailyStart + 1);

// Find the closing of lvl block
let lvlEnd = lvlStart;
let depth = 0;
for (let i = lvlStart; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('{')) depth++;
  if (line.includes('}')) depth--;
  if (depth === 0) {
    lvlEnd = i;
    break;
  }
}
console.log('lvlEnd:', lvlEnd + 1);

// Find the closing of daily block
let dailyEnd = dailyStart;
depth = 0;
for (let i = dailyStart; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('{')) depth++;
  if (line.includes('}')) depth--;
  if (depth === 0) {
    dailyEnd = i;
    break;
  }
}
console.log('dailyEnd:', dailyEnd + 1);

// Find the closing of femboy block
let femboyEnd = femboyStart;
depth = 0;
for (let i = femboyStart; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('{')) depth++;
  if (line.includes('}')) depth--;
  if (depth === 0) {
    femboyEnd = i;
    break;
  }
}
console.log('femboyEnd:', femboyEnd + 1);

// Extract blocks
const beforeFemboy = lines.slice(0, femboyStart);
const femboyBlock = lines.slice(femboyStart, femboyEnd + 1);
const lvlBlock = lines.slice(lvlStart, lvlEnd + 1);
const dailyBlock = lines.slice(dailyStart, dailyEnd + 1);
const afterFemboy = lines.slice(femboyEnd + 1);

// Reassemble: beforeFemboy + lvl + daily + femboy + afterFemboy
const newLines = [
  ...beforeFemboy,
  ...lvlBlock,
  ...dailyBlock,
  ...femboyBlock,
  ...afterFemboy
];

fs.writeFileSync(path, newLines.join('\n'));
console.log('Restructured top.js successfully');
