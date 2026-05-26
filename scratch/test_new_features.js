const { withData, createUser } = require('../utils/storage');
const economy = require('../utils/economy');
const pfp = require('../commands/pfp');
const bal = require('../commands/bal');
const sklep = require('../commands/sklep');
const wplac = require('../commands/wplac');

async function runTests() {
  console.log('=== STARTING TESTS FOR NEW FEATURES ===\n');

  // Test 1: PFP Creator Badge
  console.log('--- TEST 1: Creator Badge on pfp ---');
  const mockClient = {
    api: null,
    userNames: new Map([
      ['100060812419294', 'SuperCreator']
    ])
  };

  const mockMessageCreator = {
    author: { id: '100060812419294', username: 'SuperCreator' },
    mentions: { users: { first: () => null } },
    reply: async (text) => {
      console.log('PFP Response:');
      console.log(text);
      if (text.includes('🎖️ Odznaki: 🛠️ TWÓRCA')) {
        console.log('✅ Creator badge test passed!');
      } else {
        console.error('❌ Creator badge test failed!');
      }
    }
  };
  await pfp.execute(mockClient, mockMessageCreator, []);

  // Test 2: Shop bank upgrade
  console.log('\n--- TEST 2: Shop Bank Capacity Upgrade ---');
  // First clear inventory and set balance
  await withData(store => {
    const user = createUser('test_buyer_id', store.users);
    user.balance = 200000;
    user.bank = 0;
    
    // Clear inventory
    if (store.inventory['test_buyer_id']) {
      delete store.inventory['test_buyer_id'];
    }
  });

  const mockClientShop = {
    userNames: new Map()
  };

  const mockMessageShop = {
    author: { id: 'test_buyer_id', username: 'Buyer' },
    reply: async (text) => {
      console.log('Shop Response:', text);
    }
  };

  // Add the sejf item directly to inventory since it is not buyable in shop
  await withData(store => {
    const inventory = economy.ensureInventoryRecord(store.inventory, 'test_buyer_id');
    economy.addItem(inventory, 'sejf', 1);
  });

  // Verify capacity increased
  const capacityPassed = await withData(store => {
    const user = createUser('test_buyer_id', store.users);
    const inventory = economy.ensureInventoryRecord(store.inventory, 'test_buyer_id');
    const cap = economy.getBankCapacity(user, inventory);
    console.log(`Bank capacity: ${cap} (expected: 175000)`);
    return cap === 175000;
  });

  if (capacityPassed) {
    console.log('✅ Bank capacity upgrade test passed!');
  } else {
    console.error('❌ Bank capacity upgrade test failed!');
  }

  // Test 3: Bank Interest co 12h
  console.log('\n--- TEST 3: Bank Interest co 12h ---');
  // Set bank balance and interest payout time to 12.5 hours ago
  await withData(store => {
    const user = createUser('test_interest_user', store.users);
    user.balance = 1000;
    user.bank = 50000; // 2% of 50000 is 1000
    
    // Set lastInterestPayout to 13 hours ago
    store.profiles.lastInterestPayout = Date.now() - 13 * 60 * 60 * 1000;
  });

  console.log('Triggering withData transaction to process interest...');
  // A transaction withData should trigger interest payout
  await withData(async (store) => {
    // Interest should have been applied here
    const user = store.users['test_interest_user'];
    console.log(`User balance after 1 interest payout: ${user.balance} (expected: 2000)`);
    if (user.balance === 2000) {
      console.log('✅ Single period interest payout passed!');
    } else {
      console.error('❌ Single period interest payout failed!');
    }
  });

  // Test 3b: Multiple interest periods (e.g. 25 hours ago -> 2 payouts)
  await withData(store => {
    const user = createUser('test_interest_user', store.users);
    user.balance = 1000;
    user.bank = 50000;
    store.profiles.lastInterestPayout = Date.now() - 25 * 60 * 60 * 1000;
  });

  console.log('Triggering withData transaction for multiple interest payouts...');
  await withData(async (store) => {
    const user = store.users['test_interest_user'];
    console.log(`User balance after multiple interest payouts: ${user.balance} (expected: 3000)`);
    if (user.balance === 3000) {
      console.log('✅ Multiple period interest payout passed!');
    } else {
      console.error('❌ Multiple period interest payout failed!');
    }
  });

  // Test 3c: Bal command output
  console.log('Checking !bal command output for interest...');
  const mockMessageBal = {
    author: { id: 'test_interest_user', username: 'InterestUser' },
    mentions: { users: { first: () => null } },
    reply: async (text) => {
      console.log('Bal Response:');
      console.log(text);
      if (text.includes('Kolejne odsetki: za')) {
        console.log('✅ Bal interest timer test passed!');
      } else {
        console.error('❌ Bal interest timer test failed!');
      }
    }
  };
  await bal.execute(mockClient, mockMessageBal, []);

  // Clean up
  await withData(store => {
    delete store.users['test_buyer_id'];
    delete store.users['test_interest_user'];
    if (store.inventory['test_buyer_id']) {
      delete store.inventory['test_buyer_id'];
    }
  });
  console.log('\n=== ALL TESTS FINISHED ===');
}

runTests().catch(console.error);
