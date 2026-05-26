const fs = require('fs');

function run() {
  const logPath = 'c:\\Users\\dupek\\Desktop\\nie mam pojecia\\scratch\\test_multi_gang.log';
  if (!fs.existsSync(logPath)) {
    console.log('Log file not found.');
    return;
  }

  // Read file as binary and decode from UTF-16LE or UTF-8 depending on byte order mark
  const buffer = fs.readFileSync(logPath);
  let content = '';
  if (buffer.readUInt16LE(0) === 0xFEFF || buffer.readUInt16LE(0) === 0xFFFE || buffer.toString('utf8').includes('\u0000')) {
    content = buffer.toString('utf16le');
  } else {
    content = buffer.toString('utf8');
  }

  const lines = content.split('\n');
  console.log('--- Failed Assertions in test_multi_gang.log ---');
  for (const line of lines) {
    if (line.includes('❌')) {
      console.log(line.trim());
    }
  }
}

run();
