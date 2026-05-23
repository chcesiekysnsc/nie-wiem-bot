const fs = require('fs');
const path = require('path');

const libPath = path.join(__dirname, '..', 'node_modules', '@dongdev', 'fca-unofficial', 'dist', 'index.js');
if (!fs.existsSync(libPath)) {
  console.error('File not found:', libPath);
  process.exit(1);
}

const content = fs.readFileSync(libPath, 'utf8');

// Let's find occurrences of getUserInfo in the file
const regex = /getUserInfo/g;
let match;
const matches = [];

while ((match = regex.exec(content)) !== null) {
  matches.push(match.index);
}

console.log(`Found ${matches.length} occurrences of getUserInfo.`);

for (let i = 0; i < matches.length; i++) {
  const index = matches[i];
  const start = Math.max(0, index - 200);
  const end = Math.min(content.length, index + 800);
  console.log(`--- Match ${i + 1} at index ${index} ---`);
  console.log(content.slice(start, end));
  console.log('-------------------------------------\n');
}
