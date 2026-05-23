const { withData, createUser } = require('../utils/storage');
const top = require('../commands/top');
const pfp = require('../commands/pfp');

async function testRanking() {
  console.log('=== TESTING MESSAGE COUNT & RANKING ===\n');

  // Set message stats in database
  await withData(store => {
    const user1 = createUser('user_msg_1', store.users);
    user1.messageCount = 500;
    user1.groupMessages = { 'test_thread_1': 100, 'test_thread_2': 400 };

    const user2 = createUser('user_msg_2', store.users);
    user2.messageCount = 1200;
    user2.groupMessages = { 'test_thread_1': 900, 'test_thread_2': 300 };

    const user3 = createUser('100060812419294', store.users);
    user3.messageCount = 20;
    user3.groupMessages = { 'test_thread_1': 10 };
  });

  const mockClient = {
    api: null,
    userNames: new Map([
      ['user_msg_1', 'Kamil'],
      ['user_msg_2', 'Agnieszka'],
      ['100060812419294', 'SuperCreator']
    ])
  };

  const mockMessage = {
    guild: { id: 'test_thread_1' },
    author: { id: 'user_msg_1', username: 'Kamil' },
    mentions: { users: { first: () => null } },
    reply: async (text) => {
      console.log('\n--- Bot Response ---');
      console.log(text);
      console.log('--------------------\n');
    }
  };

  console.log('Testing: !top wiadomosci');
  await top.execute(mockClient, mockMessage, ['wiadomosci']);

  console.log('Testing: !top msg');
  await top.execute(mockClient, mockMessage, ['msg']);

  console.log('Testing: !pfp for Kamil (user_msg_1)');
  await pfp.execute(mockClient, mockMessage, []);

  // Clean up
  await withData(store => {
    delete store.users['user_msg_1'];
    delete store.users['user_msg_2'];
  });
  console.log('=== TEST COMPLETED ===');
}

testRanking().catch(console.error);
