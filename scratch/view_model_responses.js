const fs = require('fs');
const readline = require('readline');

async function run() {
  const logFile = 'C:\\Users\\dupek\\.gemini\\antigravity\\brain\\7113e626-1364-4642-bb03-4c9f60976ae5\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(logFile);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.step_index >= 6075 && obj.step_index <= 6100) {
        console.log(`\n=== STEP ${obj.step_index} (${obj.source} - ${obj.type}) ===`);
        console.log(obj.content || (obj.tool_calls ? JSON.stringify(obj.tool_calls) : ''));
      }
    } catch (e) {}
  }
}

run().catch(console.error);
