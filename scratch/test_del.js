const { withData, createUser } = require('../utils/storage');
const delCmd = require('../commands/del');
const config = require('../config/config');

async function testDel() {
  console.log('=== TESTING ADMIN !DEL NEGATIVE BALANCE ===\n');

  const testUserId = 'test_user_del_1';
  await withData(store => {
    const user = createUser(testUserId, store.users);
    user.balance = 5000;
  });

  const mockClient = {
    userNames: new Map([[testUserId, 'Tomasz']]),
    api: null
  };

  const mockMessage = {
    author: { id: config.admins[0] }, // Must be admin
    mentions: { users: { first: () => ({ id: testUserId, username: 'Tomasz' }) } },
    reply: async (text) => {
      console.log('Bot response:', text);
    }
  };

  console.log('Initial user balance set to 5000.');
  console.log('Running: !del 8000 @Tomasz');
  await delCmd.execute(mockClient, mockMessage, ['8000']);

  let finalBalance;
  await withData(store => {
    finalBalance = store.users[testUserId].balance;
    // Clean up
    delete store.users[testUserId];
  });

  console.log('Final user balance in DB:', finalBalance);
  if (finalBalance === -3000) {
    console.log('✅ TEST PASSED: Balance went to -3000');
  } else {
    console.log('❌ TEST FAILED: Balance did not go negative');
  }
}

testDel().catch(console.error);
