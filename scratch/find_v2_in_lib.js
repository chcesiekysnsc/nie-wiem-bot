const fs = require('fs');
const path = require('path');

const libPath = path.join(__dirname, '..', 'node_modules', '@dongdev', 'fca-unofficial', 'dist', 'index.js');
const content = fs.readFileSync(libPath, 'utf8');

const regex = /getUserInfoV2/g;
let match;
const matches = [];

while ((match = regex.exec(content)) !== null) {
  matches.push(match.index);
}

console.log(`Found ${matches.length} occurrences of getUserInfoV2.`);

for (let i = 0; i < matches.length; i++) {
  const index = matches[i];
  const start = Math.max(0, index - 200);
  const end = Math.min(content.length, index + 800);
  console.log(`--- Match ${i + 1} ---`);
  console.log(content.slice(start, end));
  console.log('---------------------\n');
}
