const { exec } = require('child_process');

exec('node scratch/test_multi_gang.js', (err, stdout, stderr) => {
  const lines = stdout.split('\n');
  console.log('--- Failed Assertions in test_multi_gang.js ---');
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('❌') || trimmed.includes('FAIL:')) {
      console.log(trimmed);
      count++;
    }
  }
  console.log(`Found ${count} failures.`);
  if (stderr) {
    console.log('Stderr:', stderr);
  }
});
