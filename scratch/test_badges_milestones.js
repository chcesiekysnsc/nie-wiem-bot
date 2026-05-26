const { withData, createUser } = require('../utils/storage');
const economy = require('../utils/economy');
const config = require('../config/config');
const cooldowns = require('../utils/cooldowns');

async function runTests() {
  console.log('=== STARTING TESTS FOR BADGES, MILESTONES & LEVELING ===\n');

  // Test 1: XP threshold is increased by 20%
  console.log('--- TEST 1: XP required per level +20% ---');
  const level5Xp = economy.xpForLevel(5, 0);
  const baseLvl5 = config.economy.xpPerLevelBase + 5 * config.economy.xpPerLevelGrowth;
  const expectedLvl5 = Math.floor(baseLvl5 * 1.20);
  console.log(`Level 5 XP required: ${level5Xp} (expected: ${expectedLvl5})`);
  if (level5Xp === expectedLvl5) {
    console.log('✅ XP threshold calculation test passed!');
  } else {
    console.error('❌ XP threshold calculation test failed!');
  }

  // Test 2: recordGame gives exactly 25 XP by default
  console.log('\n--- TEST 2: recordGame default 25 XP ---');
  await withData(store => {
    const user = createUser('test_xp_user', store.users);
    user.xp = 0;
    user.level = 1;
    user.prestige = 0;
    user.badges = [];
    
    economy.recordGame(user, 1000, undefined, store.inventory['test_xp_user']);
    console.log(`User XP after 1 game: ${user.xp} (expected: 25)`);
    if (user.xp === 25) {
      console.log('✅ Default 25 XP per game test passed!');
    } else {
      console.error('❌ Default 25 XP per game test failed!');
    }
  });

  // Test 3: Grinder badges (Gracz / Weteran / Uzależniony) give +5% / +8% / +12% XP
  console.log('\n--- TEST 3: Grinder badge XP bonuses ---');
  await withData(store => {
    const user = createUser('test_gracz_xp', store.users);
    user.xp = 0;
    user.badges = [config.badges.gracz];
    economy.recordGame(user, 1000, 25, store.inventory['test_gracz_xp']);
    console.log(`Gracz (+5%) XP after game: ${user.xp} (expected: 26)`); // Math.round(25 * 1.05) = 26

    const userWet = createUser('test_weteran_xp', store.users);
    userWet.xp = 0;
    userWet.badges = [config.badges.weteran];
    economy.recordGame(userWet, 1000, 25, store.inventory['test_weteran_xp']);
    console.log(`Weteran (+8%) XP after game: ${userWet.xp} (expected: 27)`); // Math.round(25 * 1.08) = 27

    const userUzal = createUser('test_uzal_xp', store.users);
    userUzal.xp = 0;
    userUzal.badges = [config.badges.uzalezniony];
    economy.recordGame(userUzal, 1000, 25, store.inventory['test_uzal_xp']);
    console.log(`Uzależniony (+12%) XP after game: ${userUzal.xp} (expected: 28)`); // Math.round(25 * 1.12) = 28

    if (user.xp === 26 && userWet.xp === 27 && userUzal.xp === 28) {
      console.log('✅ Grinder XP bonuses test passed!');
    } else {
      console.error('❌ Grinder XP bonuses test failed!');
    }
  });

  // Test 4: Milestone levels award correct prizes
  console.log('\n--- TEST 4: Milestone rewards ---');
  await withData(store => {
    const user = createUser('test_milestone_user', store.users);
    user.level = 9;
    user.xp = 0;
    user.balance = 0;
    user.prestige = 0;
    const inv = economy.ensureInventoryRecord(store.inventory, 'test_milestone_user');
    delete inv.paczka_brazowa;
    
    // Level up from 9 to 10
    const needed = economy.xpForLevel(9, 0);
    economy.addXp(user, needed, inv);
    
    console.log(`Milestone level 10: level is ${user.level}, balance is ${user.balance}, paczka_brazowa is ${inv.paczka_brazowa}`);
    const hasCoins = user.balance === 500 + 10 * 40 + 150000; // base lvl up reward + milestone reward
    const hasItem = inv.paczka_brazowa === 1;

    if (hasCoins && hasItem) {
      console.log('✅ Milestone reward level 10 test passed!');
    } else {
      console.error('❌ Milestone reward level 10 test failed!');
    }
  });

  // Test 5: Bank capacity upgrade from Milioner / Miliarder badges
  console.log('\n--- TEST 5: Bank capacity badge bonus ---');
  await withData(store => {
    const user = createUser('test_cap_user', store.users);
    const inv = economy.ensureInventoryRecord(store.inventory, 'test_cap_user');
    
    user.badges = [];
    const baseCap = economy.getBankCapacity(user, inv);
    
    user.badges = [config.badges.milioner];
    const capMil = economy.getBankCapacity(user, inv);
    
    user.badges = [config.badges.miliarder];
    const capMiliar = economy.getBankCapacity(user, inv);

    console.log(`Base capacity: ${baseCap}, Milioner capacity: ${capMil} (expected: +25k), Miliarder capacity: ${capMiliar} (expected: +50k)`);
    if (capMil === baseCap + 25000 && capMiliar === baseCap + 50000) {
      console.log('✅ Bank capacity badge bonuses test passed!');
    } else {
      console.error('❌ Bank capacity badge bonuses test failed!');
    }
  });

  // Test 6: Wealth badges interest payouts
  console.log('\n--- TEST 6: Wealth badges bank interest payouts ---');
  await withData(store => {
    const userBog = createUser('test_interest_bog', store.users);
    userBog.balance = 0;
    userBog.bank = 300000;
    userBog.badges = [config.badges.bogacz]; // 2% + 0.5% = 2.5% -> 7500 coins

    const userMil = createUser('test_interest_mil', store.users);
    userMil.balance = 0;
    userMil.bank = 3000000;
    userMil.badges = [config.badges.milioner]; // 2% + 1% = 3% -> 90000 coins

    const userMiliar = createUser('test_interest_miliar', store.users);
    userMiliar.balance = 0;
    userMiliar.bank = 30000000;
    userMiliar.badges = [config.badges.miliarder]; // 2% + 2% = 4% -> 1200000 coins

    store.profiles.lastInterestPayout = Date.now() - 13 * 60 * 60 * 1000; // Trigger interest payout
  });

  // Trigger payout via withData
  await withData(async (store) => {
    const userBog = store.users['test_interest_bog'];
    const userMil = store.users['test_interest_mil'];
    const userMiliar = store.users['test_interest_miliar'];

    console.log(`Bogacz interest payout: ${userBog.balance} (expected: 7500)`);
    console.log(`Milioner interest payout: ${userMil.balance} (expected: 90000)`);
    console.log(`Miliarder interest payout: ${userMiliar.balance} (expected: 1200000)`);

    if (userBog.balance === 7500 && userMil.balance === 90000 && userMiliar.balance === 1200000) {
      console.log('✅ Wealth badges interest payout test passed!');
    } else {
      console.error('❌ Wealth badges interest payout test failed!');
    }
  });

  // Test 7: Cooldown reductions from commands badges
  console.log('\n--- TEST 7: Cooldown reductions ---');
  await withData(async (store) => {
    const userNormal = createUser('test_cd_normal', store.users);
    userNormal.badges = [];
    userNormal.commandsUsed = 0;
    
    const userKlik = createUser('test_cd_klik', store.users);
    userKlik.badges = [config.badges.klikacz];
    userKlik.commandsUsed = 300;
 
    const userWlad = createUser('test_cd_wlad', store.users);
    userWlad.badges = [config.badges.wladcaBota];
    userWlad.commandsUsed = 3000;
  });

  // Clear cooldowns first to ensure we write new ones
  await withData(store => {
    delete store.cooldowns.commands['test_cd_normal'];
    delete store.cooldowns.commands['test_cd_klik'];
    delete store.cooldowns.commands['test_cd_wlad'];
  });

  // Set the cooldowns using mocked Date.now
  const originalNow = Date.now;
  const fixedNow = 100000000;
  global.Date.now = () => fixedNow;

  try {
    await cooldowns.checkCooldown('daily', 'test_cd_normal');
    await cooldowns.checkCooldown('daily', 'test_cd_klik');
    await cooldowns.checkCooldown('daily', 'test_cd_wlad');

    let timeNormal, timeKlik, timeWlad;
    await withData(store => {
      timeNormal = store.cooldowns.commands['test_cd_normal']['daily'] || 0;
      timeKlik = store.cooldowns.commands['test_cd_klik']['daily'] || 0;
      timeWlad = store.cooldowns.commands['test_cd_wlad']['daily'] || 0;
    });

    console.log(`Timestamps set: Normal: ${timeNormal}, Klikacz: ${timeKlik}, Wladca Bota: ${timeWlad}`);

    const durNormal = timeNormal - fixedNow;
    const durKlik = timeKlik - fixedNow;
    const durWlad = timeWlad - fixedNow;

    console.log(`Durations: Normal: ${durNormal}ms, Klikacz: ${durKlik}ms, Wladca Bota: ${durWlad}ms`);

    if (durNormal === 5000 && durKlik === 4850 && durWlad === 4750) {
      console.log('✅ Cooldown reductions test passed!');
    } else {
      console.error('❌ Cooldown reductions test failed! Durations did not match expected values.');
    }
  } finally {
    global.Date.now = originalNow;
  }

  // Test 8: Level 100 reset and prestige growth
  console.log('\n--- TEST 8: Level 100 reset & Prestige growth ---');
  await withData(store => {
    const user = createUser('test_prestige_user', store.users);
    user.level = 99;
    user.xp = 0;
    user.prestige = 1;
    user.balance = 0;
    const inv = economy.ensureInventoryRecord(store.inventory, 'test_prestige_user');
    
    // Level up from 99 to 100
    const needed = economy.xpForLevel(99, 1);
    economy.addXp(user, needed, inv);
    
    console.log(`After leveling past 100: level is ${user.level} (expected: 1), prestige is ${user.prestige} (expected: 2)`);
    
    const xpLvl2Prestige2 = economy.xpForLevel(2, 2);
    console.log(`XP needed for lvl 2 at prestige 2: ${xpLvl2Prestige2} (expected: 512)`);
    
    if (user.level === 1 && user.prestige === 2 && xpLvl2Prestige2 === 512) {
      console.log('✅ Level 100 reset and prestige growth test passed!');
    } else {
      console.error('❌ Level 100 reset and prestige growth test failed!');
    }
  });

  // Test 9: Tips sent tracking and shamewall sorting
  console.log('\n--- TEST 9: Tip tracking & shamewall sorting ---');
  await withData(store => {
    const userSender = createUser('test_sender_tip', store.users);
    userSender.balance = 10000;
    const userReceiver = createUser('test_receiver_tip', store.users);
    userReceiver.balance = 0;
  });

  const tipCommand = require('../commands/tip');
  const mockMessage = {
    author: { id: 'test_sender_tip' },
    mentions: { users: { first: () => ({ id: 'test_receiver_tip', username: 'TestReceiver' }) } },
    reply: async (msg) => console.log('Mock Reply:', msg)
  };
  await tipCommand.execute({ userNames: new Map() }, mockMessage, ['1000']);

  let tipsSentCount = 0;
  await withData(store => {
    const sender = store.users['test_sender_tip'];
    tipsSentCount = (sender.tipsSent && sender.tipsSent['test_receiver_tip']) || 0;
  });
  console.log(`Tips sent to receiver: ${tipsSentCount} (expected: 1)`);

  // Test shamewall sorting
  await withData(store => {
    const debtor1 = createUser('debtor_1', store.users);
    debtor1.activeLoan = { amount: 50000, originalAmount: 30000 };
    
    const debtor2 = createUser('debtor_2', store.users);
    debtor2.activeLoan = { amount: 150000, originalAmount: 100000 };
  });

  const shamewallCommand = require('../commands/shamewall');
  let shamewallPassed = false;
  const mockMessageShamewall = {
    reply: async (msg) => {
      console.log('Shamewall Output:\n', msg);
      if (msg.includes('debtor_2') && msg.indexOf('debtor_2') < msg.indexOf('debtor_1')) {
        shamewallPassed = true;
      }
    }
  };
  await shamewallCommand.execute({ userNames: new Map([['debtor_1', 'debtor_1'], ['debtor_2', 'debtor_2']]) }, mockMessageShamewall, []);

  if (tipsSentCount === 1 && shamewallPassed) {
    console.log('✅ Tip tracking & shamewall sorting test passed!');
  } else {
    console.error('❌ Tip tracking & shamewall sorting test failed!');
  }

  console.log('\n=== ALL TESTS FINISHED ===');
}

runTests();
