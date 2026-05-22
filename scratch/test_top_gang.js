const { withData } = require('../utils/storage');
const top = require('../commands/top');

async function setupTestData() {
  await withData(store => {
    store.profiles.gangs = store.profiles.gangs || {};
    
    // Add three test gangs
    store.profiles.gangs['gang1'] = {
      name: 'Alpha Squad',
      bossId: 'boss_1',
      vault: 500000
    };
    store.profiles.gangs['gang2'] = {
      name: 'Beta Syndicate',
      bossId: 'boss_2',
      vault: 1200000
    };
    store.profiles.gangs['gang3'] = {
      name: 'Gamma Cartel',
      bossId: 'boss_3',
      vault: 80000
    };
    store.profiles.gangs['gang4'] = {
      name: 'Delta Crew',
      bossId: 'boss_4',
      vault: 5000
    };
  });
  console.log('Setup gang test data.');
}

async function runTest() {
  await setupTestData();

  const client = {
    userNames: new Map([
      ['boss_1', 'Wojtek'],
      ['boss_2', 'Janusz'],
      ['boss_3', 'Marek'],
      ['boss_4', 'Karol']
    ])
  };

  const mockMessage = {
    guild: { id: 'test_thread_id' },
    author: { id: 'boss_1', username: 'Wojtek' },
    reply: async (text) => {
      console.log('\n=== BOT REPLY ===');
      console.log(text);
      console.log('=================\n');
    }
  };

  console.log('Executing !top gang...');
  await top.execute(client, mockMessage, ['gang']);

  // Clean up
  await withData(store => {
    delete store.profiles.gangs['gang1'];
    delete store.profiles.gangs['gang2'];
    delete store.profiles.gangs['gang3'];
    delete store.profiles.gangs['gang4'];
  });
  console.log('Cleaned up gang test data.');
}

runTest().catch(console.error);
