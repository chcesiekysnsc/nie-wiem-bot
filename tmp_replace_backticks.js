const fs = require('fs');
const path = require('path');
function transform(text) {
  let out = '';
  let state = 'none';
  let quoteChar = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === 'none') {
      if (ch === '"' || ch === "'") {
        quoteChar = ch;
        state = 'str';
        out += ch;
        continue;
      }
      if (ch === '`') {
        state = 'template';
        out += ch;
        continue;
      }
      out += ch;
      continue;
    }
    if (state === 'str') {
      if (ch === '\\') {
        out += ch;
        if (i + 1 < text.length) {
          out += text[++i];
        }
        continue;
      }
      if (ch === quoteChar) {
        out += ch;
        state = 'none';
        quoteChar = null;
        continue;
      }
      if (ch === '`') {
        let j = i + 1;
        while (j < text.length && text[j] !== '`') {
          if (text[j] === '\\' && j + 1 < text.length) {
            j += 2;
          } else {
            j++;
          }
        }
        if (j < text.length && text[j] === '`') {
          const inner = text.slice(i + 1, j);
          out += '**' + inner + '**';
          i = j;
          continue;
        }
      }
      out += ch;
      continue;
    }
    if (state === 'template') {
      if (ch === '\\' && i + 1 < text.length && text[i + 1] === '`') {
        let j = i + 2;
        while (j < text.length && text[j] !== '`') {
          if (text[j] === '\\' && j + 1 < text.length) {
            j += 2;
          } else {
            j++;
          }
        }
        if (j < text.length && text[j] === '`') {
          const inner = text.slice(i + 2, j);
          out += '**' + inner + '**';
          i = j;
          continue;
        }
      }
      out += ch;
      if (ch === '`') {
        state = 'none';
      }
      continue;
    }
  }
  return out;
}
function processFile(filePath) {
  const orig = fs.readFileSync(filePath, 'utf8');
  const changed = transform(orig);
  if (changed !== orig) {
    fs.writeFileSync(filePath, changed, 'utf8');
    return true;
  }
  return false;
}
function walk(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...walk(full));
    } else if (item.isFile() && full.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}
const root = process.cwd();
const files = walk(root);
let count = 0;
for (const file of files) {
  if (processFile(file)) count++;
}
console.log('processed', count, 'files');
