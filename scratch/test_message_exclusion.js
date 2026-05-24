const { withData, createUser } = require('../utils/storage');
const config = require('../config/config');

async function runTest() {
  console.log('=== TESTING COMMAND MESSAGE EXCLUSION ===\n');

  const testUser = 'tester_exclusion_user';
  const testThread = 'test_exclusion_thread';

  // Clean up user if left over
  await withData(store => {
    delete store.users[testUser];
  });

  // Mocking the event handler logic from self_bot.js
  const handleMessage = async (body) => {
    const text = body.trim();
    const senderId = testUser;
    const threadId = testThread;

    const isGroup = threadId && threadId !== senderId;
    const isCommand = text.startsWith(config.prefix);
    if (isGroup && !isCommand) {
      await withData(store => {
        const u = createUser(senderId, store.users);
        u.messageCount = (u.messageCount || 0) + 1;
        u.groupMessages = u.groupMessages || {};
        u.groupMessages[threadId] = (u.groupMessages[threadId] || 0) + 1;
      });
    }
  };

  // 1. Send normal message
  console.log('Sending normal message: "Cześć co tam?"');
  await handleMessage('Cześć co tam?');

  let stats = await withData(store => {
    const u = store.users[testUser];
    return u ? { messageCount: u.messageCount, groupMessages: { ...u.groupMessages } } : null;
  });

  console.log('Stats after normal message:', stats);
  if (stats && stats.messageCount === 1 && stats.groupMessages[testThread] === 1) {
    console.log('✅ PASS: Normal message correctly incremented message count.');
  } else {
    console.log('❌ FAIL: Normal message did not increment message count correctly.');
  }

  // 2. Send command message
  console.log('\nSending command message: "!top wiadomosci"');
  await handleMessage('!top wiadomosci');

  stats = await withData(store => {
    const u = store.users[testUser];
    return u ? { messageCount: u.messageCount, groupMessages: { ...u.groupMessages } } : null;
  });

  console.log('Stats after command message:', stats);
  if (stats && stats.messageCount === 1 && stats.groupMessages[testThread] === 1) {
    console.log('✅ PASS: Command message was correctly excluded from message count.');
  } else {
    console.log('❌ FAIL: Command message was incorrectly counted as a normal message.');
  }

  // Clean up
  await withData(store => {
    delete store.users[testUser];
  });

  console.log('\n=== TEST COMPLETED ===');
}

runTest().catch(console.error);
