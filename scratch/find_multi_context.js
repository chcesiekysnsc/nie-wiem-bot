const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function run() {
  const logFile = 'C:\\Users\\dupek\\.gemini\\antigravity\\brain\\7113e626-1364-4642-bb03-4c9f60976ae5\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(logFile);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Searching USER_INPUT steps in transcript for multi/konto/blokad...');

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        const text = String(obj.content || '').toLowerCase();
        if (text.includes('multi') || text.includes('blok') || text.includes('ban') || text.includes('warn') || text.includes('kara')) {
          console.log(`\n=== STEP ${obj.step_index} ===`);
          console.log(obj.content);
        }
      }
    } catch (e) {
      // Ignored
    }
  }
}

run().catch(console.error);
