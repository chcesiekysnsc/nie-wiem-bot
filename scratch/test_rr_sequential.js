const { withData, createUser } = require('../utils/storage');
const rosyjska = require('../commands/rosyjska');

async function setupTestData() {
  await withData(store => {
    const challenger = createUser('user_challenger_123', store.users);
    challenger.balance = 5000;
    
    const target = createUser('user_target_456', store.users);
    target.balance = 5000;
  });
  console.log('Setup test data completed.');
}

async function runTest() {
  await setupTestData();

  const client = {
    rrRequests: new Map(),
    userNames: new Map([
      ['user_challenger_123', 'Wojtek_Wyznik'],
      ['user_target_456', 'Robert_Tarcza']
    ])
  };

  // Add the challenge request: target accepts challenge from challenger
  client.rrRequests.set('user_target_456', {
    challengerId: 'user_challenger_123',
    amount: 100
  });

  const replies = [];
  const message = {
    author: {
      id: 'user_target_456',
      username: 'Robert_Tarcza'
    },
    mentions: {
      users: {
        first: () => null
      }
    },
    reply: async (text) => {
      const now = Date.now();
      replies.push({ text, timestamp: now });
      console.log(`[REPLY] [${new Date(now).toISOString()}] -> ${text}`);
      return { messageID: 'msg_' + Math.random().toString(36).slice(2, 9) };
    }
  };

  console.log('--- Executing: !rr acc ---');
  await rosyjska.execute(client, message, ['acc']);
  console.log('--- Execution finished ---');

  // Verify timestamps
  console.log('\n--- Timing and Output Verification ---');
  let prevTime = null;
  let allCorrect = true;
  replies.forEach((rep, index) => {
    if (prevTime !== null) {
      const diff = rep.timestamp - prevTime;
      console.log(`Msg ${index} posted after ${diff}ms`);
      if (diff < 900 || diff > 1300) {
        console.error(`❌ Delay between messages is unexpected: ${diff}ms (expected around 1000ms)`);
        allCorrect = false;
      }
    } else {
      console.log(`Msg ${index} (Initial)`);
    }
    prevTime = rep.timestamp;
  });

  if (allCorrect && replies.length >= 3) {
    console.log('✅ Success! Russian Roulette sequential turns and delay are correct.');
  } else {
    console.log('❌ Failure in sequential replies or delay checks.');
  }
}

runTest().catch(console.error);
