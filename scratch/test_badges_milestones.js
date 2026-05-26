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
    const inv = economy.ensureInventoryRecord(store.inventory, 'test_milestone_user');
    delete inv.paczka_brazowa;
    
    // Level up from 9 to 10
    const needed = economy.xpForLevel(9, 0);
    economy.addXp(user, needed, inv);
    
    console.log(`Milestone level 10: level is ${user.level}, balance is ${user.balance}, paczka_brazowa is ${inv.paczka_brazowa}`);
    const hasCoins = user.balance === 500 + 10 * 40 + 5000; // base lvl up reward + milestone reward
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
    userBog.bank = 100000;
    userBog.badges = [config.badges.bogacz]; // 2% + 0.5% = 2.5% -> 2500 coins

    const userMil = createUser('test_interest_mil', store.users);
    userMil.balance = 0;
    userMil.bank = 100000;
    userMil.badges = [config.badges.milioner]; // 2% + 1% = 3% -> 3000 coins

    const userMiliar = createUser('test_interest_miliar', store.users);
    userMiliar.balance = 0;
    userMiliar.bank = 100000;
    userMiliar.badges = [config.badges.miliarder]; // 2% + 2% = 4% -> 4000 coins

    store.profiles.lastInterestPayout = Date.now() - 13 * 60 * 60 * 1000; // Trigger interest payout
  });

  // Trigger payout via withData
  await withData(async (store) => {
    const userBog = store.users['test_interest_bog'];
    const userMil = store.users['test_interest_mil'];
    const userMiliar = store.users['test_interest_miliar'];

    console.log(`Bogacz interest payout: ${userBog.balance} (expected: 2500)`);
    console.log(`Milioner interest payout: ${userMil.balance} (expected: 3000)`);
    console.log(`Miliarder interest payout: ${userMiliar.balance} (expected: 4000)`);

    if (userBog.balance === 2500 && userMil.balance === 3000 && userMiliar.balance === 4000) {
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
    
    const userKlik = createUser('test_cd_klik', store.users);
    userKlik.badges = [config.badges.klikacz];

    const userWlad = createUser('test_cd_wlad', store.users);
    userWlad.badges = [config.badges.wladcaBota];
  });

  // Set the cooldowns
  await cooldowns.checkCooldown('daily', 'test_cd_normal');
  await cooldowns.checkCooldown('daily', 'test_cd_klik');
  await cooldowns.checkCooldown('daily', 'test_cd_wlad');

  // Now check them
  const stateNormal = await cooldowns.checkCooldown('daily', 'test_cd_normal');
  const stateKlik = await cooldowns.checkCooldown('daily', 'test_cd_klik');
  const stateWlad = await cooldowns.checkCooldown('daily', 'test_cd_wlad');

  // Since cooldown registers a timestamp and sets it, we check remaining cooldowns
  console.log(`Normal daily cooldown expires in: ${stateNormal.remaining}`);
  console.log(`Klikacz daily cooldown expires in: ${stateKlik.remaining}`);
  console.log(`Wladca Bota daily cooldown expires in: ${stateWlad.remaining}`);

  // Let's verify that Klikacz has ~97% duration and Wladca Bota has ~95% duration
  // Duration for daily is config.cooldowns.daily (5 seconds) * 1000 = 5000ms
  // Klikacz duration should be 4850ms, Wladca Bota should be 4750ms
  // Let's account for elapsed time since we set the cooldowns
  const elapsedNormal = 5000 - stateNormal.remaining;
  const elapsedKlik = 4850 - stateKlik.remaining;
  const elapsedWlad = 4750 - stateWlad.remaining;

  console.log(`Elapsed times since setting cooldowns: Normal: ${elapsedNormal}ms, Klikacz: ${elapsedKlik}ms, Wladca Bota: ${elapsedWlad}ms`);

  const diffKlik = Math.abs(elapsedNormal - elapsedKlik);
  const diffWlad = Math.abs(elapsedNormal - elapsedWlad);
  
  if (diffKlik < 100 && diffWlad < 100) {
    console.log('✅ Cooldown reductions test passed!');
  } else {
    console.error('❌ Cooldown reductions test failed! KlikDiff:', diffKlik, 'WladDiff:', diffWlad);
  }

  console.log('\n=== ALL TESTS FINISHED ===');
}

runTests();
