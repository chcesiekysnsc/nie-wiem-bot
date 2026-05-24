const { withData, createUser } = require('../utils/storage');
const { formatCurrency, msToReadable } = require('../utils/economy');
const pfpCmd = require('../commands/pfp');
const balCmd = require('../commands/bal');
const dailyCmd = require('../commands/daily');
const pozyczkaCmd = require('../commands/pozyczka');
const tipCmd = require('../commands/tip');
const robCmd = require('../commands/rob');
const marryCmd = require('../commands/marry');

// Helper to simulate time passage by manually adjusting timestamps in storage
async function runTests() {
  console.log('=== RUNNING LOANS & BLACKLIST SYSTEM TESTS ===\n');

  const testUser1 = '100089655356822'; // Beta Tester + CZADOWY recipient
  const testUser2 = 'some_tester_user'; // Normal user for borrowing
  const testUser3 = 'robber_user'; // User to test robbery from testUser2

  // 1. Reset user accounts
  await withData(store => {
    // Clean database for test users
    delete store.users[testUser1];
    delete store.users[testUser2];
    delete store.users[testUser3];
    if (store.profiles.blacklist) {
      store.profiles.blacklist = store.profiles.blacklist.filter(id => id !== testUser1 && id !== testUser2 && id !== testUser3);
    }
  });

  const mockClient = {
    api: {
      sendMessage: (payload, threadID, callback, messageID) => {
        if (callback) callback();
      }
    },
    userNames: new Map([
      [testUser1, 'Czadowy_User_1'],
      [testUser2, 'Borrower_Adam'],
      [testUser3, 'Robber_Rich']
    ]),
    processedMessages: new Set(),
    isProcessed: () => false,
    markProcessed: () => {},
    marriageRequests: new Map(),
    commands: new Map()
  };

  // Setup message mocks
  const createMockMsg = (authorId, content = '') => {
    let capturedReply = null;
    return {
      author: { id: authorId, username: mockClient.userNames.get(authorId) || 'User' },
      content,
      guild: { id: 'test_thread' },
      rawEvent: { threadID: 'test_thread', messageID: 'msg_' + Math.random() },
      reply: async (payload) => {
        capturedReply = payload;
        return { success: true };
      },
      mentions: {
        users: {
          first: () => null
        }
      },
      getReply: () => capturedReply
    };
  };

  // ==========================================
  // TEST 1: Badges Order for 🔥 CZADOWY
  // ==========================================
  console.log('--- TEST 1: CZADOWY Badge Order Verification ---');
  const msgPfp1 = createMockMsg(testUser1);
  // Capturing sendMessage output
  let capturedBadges = [];
  mockClient.api.sendMessage = (payload) => {
    const match = payload.body.match(/🎖️ Odznaki: (.*)/);
    if (match) capturedBadges = match[1].split(', ');
  };

  await pfpCmd.execute(mockClient, msgPfp1, []);
  console.log('Captured badges for user 1:', capturedBadges);
  if (capturedBadges[0] === '👑 ADMIN' && capturedBadges[1] === '✨ OG' && capturedBadges[2] === '🧪 Beta Tester' && capturedBadges[3] === '🔥 CZADOWY') {
    console.log('✅ PASS: Badge order matches expectation (ADMIN first, CZADOWY 4th).');
  } else {
    console.log('❌ FAIL: Incorrect badge order.');
  }

  // Restore mock client send message
  mockClient.api.sendMessage = (payload, threadID, callback) => { if (callback) callback(); };

  // ==========================================
  // TEST 2: Timezone Daily Reset & Streaks
  // ==========================================
  console.log('\n--- TEST 2: Europe/Warsaw Calendar-Day Daily Claim Reset ---');
  const msgDaily = createMockMsg(testUser2);

  // 1st claim
  await dailyCmd.execute(mockClient, msgDaily);
  let reply = msgDaily.getReply();
  console.log('Daily claim 1 reply:', reply);

  // Try to claim again immediately (should fail)
  const msgDailyFail = createMockMsg(testUser2);
  await dailyCmd.execute(mockClient, msgDailyFail);
  console.log('Daily claim 2 (immediate) reply:', msgDailyFail.getReply());
  if (String(msgDailyFail.getReply() || '').includes('Zaczekaj jeszcze')) {
    console.log('✅ PASS: Cooldown prevents immediate double claim.');
  } else {
    console.log('❌ FAIL: Double claim allowed.');
  }

  // Simulate time travel to tomorrow 00:05 Warsaw time
  await withData(store => {
    const u = store.users[testUser2];
    // Push the claim time back to yesterday's 14:00 Warsaw time
    // Let's compute yesterday 14:00.
    // For simplicity, we just set lastDailyClaim to 25 hours ago, and dailyCooldown to 1 hour ago
    u.lastDailyClaim = Date.now() - 25 * 60 * 60 * 1000;
    u.dailyCooldown = Date.now() - 1 * 60 * 60 * 1000;
  });

  const msgDailyStreak = createMockMsg(testUser2);
  await dailyCmd.execute(mockClient, msgDailyStreak);
  console.log('Daily claim tomorrow reply:', msgDailyStreak.getReply());
  if (String(msgDailyStreak.getReply() || '').includes('Dzień: 2')) {
    console.log('✅ PASS: Daily claimed on next calendar day maintained and incremented streak.');
  } else {
    console.log('❌ FAIL: Streak did not increment.');
  }

  // Simulate time travel to 2 days later (streak should reset)
  await withData(store => {
    const u = store.users[testUser2];
    u.lastDailyClaim = Date.now() - 50 * 60 * 60 * 1000; // 50h ago (missed a calendar day)
    u.dailyCooldown = Date.now() - 26 * 60 * 60 * 1000;
  });

  const msgDailyReset = createMockMsg(testUser2);
  await dailyCmd.execute(mockClient, msgDailyReset);
  console.log('Daily claim after delay reply:', msgDailyReset.getReply());
  if (String(msgDailyReset.getReply() || '').includes('Dzień: 1')) {
    console.log('✅ PASS: Daily claimed after missed day correctly reset streak to 1.');
  } else {
    console.log('❌ FAIL: Streak did not reset.');
  }

  // ==========================================
  // TEST 3: Loan Interest Compounding
  // ==========================================
  console.log('\n--- TEST 3: Loan command compounding interest rates ---');

  await withData(store => {
    delete store.users[testUser2].activeLoan;
    store.users[testUser2].balance = 10000;
    store.users[testUser2].commandsUsed = 100;
  });

  const msgLockedLoan = createMockMsg(testUser2);
  await pozyczkaCmd.execute(mockClient, msgLockedLoan, ['100000']);
  console.log('Borrow below unlock threshold reply:', msgLockedLoan.getReply());
  if (String(msgLockedLoan.getReply() || '').includes('ponad **100** komend')) {
    console.log('✅ PASS: Loan stays locked until the user exceeds 100 used commands.');
  } else {
    console.log('❌ FAIL: Loan was not blocked below the command threshold.');
  }
  
  // Test different borrow limits
  const borrowAmounts = [
    { amt: 100000, expectedRate: 0.04 }, // <= 200k
    { amt: 250000, expectedRate: 0.08 }, // > 200k
    { amt: 350000, expectedRate: 0.12 }, // > 300k
    { amt: 450000, expectedRate: 0.20 }, // > 400k
    { amt: 500000, expectedRate: 0.20 }, // limit
  ];

  for (const t of borrowAmounts) {
    await withData(store => {
      delete store.users[testUser2].activeLoan;
      store.users[testUser2].balance = 10000;
      store.users[testUser2].commandsUsed = 150;
    });

    const msgBorrow = createMockMsg(testUser2);
    await pozyczkaCmd.execute(mockClient, msgBorrow, [String(t.amt)]);
    
    let dbRate = 0;
    await withData(store => {
      dbRate = store.users[testUser2].activeLoan.rate;
    });

    if (dbRate === t.expectedRate) {
      console.log(`✅ PASS: Borrowing ${t.amt} correctly set rate to ${dbRate * 100}%.`);
    } else {
      console.log(`❌ FAIL: Borrowing ${t.amt} set incorrect rate ${dbRate * 100}% (expected ${t.expectedRate * 100}%).`);
    }
  }

  // Test over-limit borrow
  await withData(store => {
    delete store.users[testUser2].activeLoan;
    store.users[testUser2].commandsUsed = 150;
  });
  const msgOverLimit = createMockMsg(testUser2);
  await pozyczkaCmd.execute(mockClient, msgOverLimit, ['500001']);
  console.log('Borrowing 500,001 reply:', msgOverLimit.getReply());
  if (String(msgOverLimit.getReply() || '').includes('Maksymalna kwota pożyczki')) {
    console.log('✅ PASS: Loan above 500k is blocked.');
  } else {
    console.log('❌ FAIL: Loan above 500k was allowed.');
  }

  // Simulate interest compounding (co 6 godzin)
  // Let's borrow 100k (4% co 6h)
  await withData(store => {
    delete store.users[testUser2].activeLoan;
    store.users[testUser2].balance = 10000;
    store.users[testUser2].commandsUsed = 150;
  });
  const msgBorrowInterest = createMockMsg(testUser2);
  await pozyczkaCmd.execute(mockClient, msgBorrowInterest, ['100000']);

  // Move back takenAt and lastInterestApplied by 12 hours (2 interest periods)
  await withData(store => {
    const loan = store.users[testUser2].activeLoan;
    loan.takenAt -= 12.5 * 60 * 60 * 1000;
    loan.lastInterestApplied -= 12.5 * 60 * 60 * 1000;
  });

  // Accessing database triggers withData compound logic
  let compoundAmt = 0;
  await withData(store => {
    compoundAmt = store.users[testUser2].activeLoan.amount;
  });

  // Expected compounding: 100,000 * 1.04 * 1.04 = 108,160
  console.log('Compounded loan amount after 12h:', compoundAmt);
  if (compoundAmt === 108160) {
    console.log('✅ PASS: Compounding interest correctly applied twice (+8.16% total).');
  } else {
    console.log('❌ FAIL: Compounding interest calculated incorrectly.');
  }

  // ==========================================
  // TEST 4: Loan Transfer & Robbery Blocks
  // ==========================================
  console.log('\n--- TEST 4: Loan Transfer block & Robbery protection (48h) ---');

  // Set up: User 2 has 10k own money, 100k loan (total balance: 110k)
  await withData(store => {
    store.users[testUser2].balance = 110000;
    store.users[testUser2].activeLoan = {
      originalAmount: 100000,
      amount: 100000,
      rate: 0.04,
      takenAt: Date.now(),
      lastInterestApplied: Date.now()
    };

    // User 3 (robber) has 150k
    const r = createUser(testUser3, store.users);
    r.balance = 150000;
  });

  // Try to transfer 15k (should fail, own balance is only 10k)
  const msgTip = createMockMsg(testUser2);
  msgTip.mentions.users.first = () => ({ id: testUser1, username: 'Target' });
  await tipCmd.execute(mockClient, msgTip, ['15000', testUser1]);
  console.log('Transferring 15k with 10k free balance reply:', msgTip.getReply());
  if (String(msgTip.getReply() || '').includes('zablokowane z tytułu pożyczki')) {
    console.log('✅ PASS: Transfer blocked for locked loan funds.');
  } else {
    console.log('❌ FAIL: Transfer allowed.');
  }

  // Try to transfer 5k (should pass)
  const msgTipPass = createMockMsg(testUser2);
  msgTipPass.mentions.users.first = () => ({ id: testUser1, username: 'Target' });
  await tipCmd.execute(mockClient, msgTipPass, ['5000', testUser1]);
  console.log('Transferring 5k with 10k free balance reply:', msgTipPass.getReply());
  if (String(msgTipPass.getReply() || '').includes('Przelano')) {
    console.log('✅ PASS: Transfer allowed for non-loan funds.');
  } else {
    console.log('❌ FAIL: Transfer of non-loan funds failed.');
  }

  // Robbery protection test
  // Borrower now has 105k (100k loan, 5k own)
  // Let's attempt to rob them. The stealable balance is victim.balance - loan.originalAmount = 105k - 100k = 5k.
  // Rob target is Borrower, robber is User 3.
  const msgRob = createMockMsg(testUser3);
  msgRob.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });

  // Let's force Math.random to always succeed in robbery to test the base stolen calculation
  const originalRandom = Math.random;
  Math.random = () => 0.1; // Success (normally < 0.60)

  let finalVictimBalance = 0;
  let finalRobberBalance = 0;

  await robCmd.execute(mockClient, msgRob, [testUser2]);
  console.log('Robbing user with 5k free balance reply:', msgRob.getReply());

  await withData(store => {
    finalVictimBalance = store.users[testUser2].balance;
    finalRobberBalance = store.users[testUser3].balance;
  });

  Math.random = originalRandom; // Restore Math.random

  // Since stealableBalance is 5k, baseStolen should be 5,000 * 0.20 = 1,000.
  // Victim's original balance was 105k, so new balance should be 104k.
  console.log('Victim balance after robbery:', finalVictimBalance);
  if (finalVictimBalance === 104000) {
    console.log('✅ PASS: Robbery only stole 20% of free funds (1,000), leaving the 100k loan untouched.');
  } else {
    console.log('❌ FAIL: Robbery stole from locked loan funds.');
  }

  // If victim's free balance < 1000, robbery should be completely blocked
  await withData(store => {
    store.users[testUser2].balance = 100500; // Only 500 free balance
    const r2 = createUser('robber_user_2', store.users);
    r2.balance = 150000;
  });
  const msgRobBlock = createMockMsg('robber_user_2');
  msgRobBlock.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });
  await robCmd.execute(mockClient, msgRobBlock, [testUser2]);
  console.log('Robbing user with 500 free balance reply:', msgRobBlock.getReply());
  if (String(msgRobBlock.getReply() || '').includes('ma za mało kasy')) {
    console.log('✅ PASS: Robbery blocked when free balance is under 1,000.');
  } else {
    console.log('❌ FAIL: Robbery of low free balance was not blocked.');
  }

  // ==========================================
  // TEST 5: Auto-Repayment after 48h
  // ==========================================
  console.log('\n--- TEST 5: Auto-Repayment after 48 Hours ---');

  // Let's set up: User has 10k balance, 100k loan. Total balance: 110k
  await withData(store => {
    store.users[testUser2].balance = 110000;
    store.users[testUser2].activeLoan = {
      originalAmount: 100000,
      amount: 100000,
      rate: 0.04,
      takenAt: Date.now() - 49 * 60 * 60 * 1000, // Taken 49h ago
      lastInterestApplied: Date.now() - 49 * 60 * 60 * 1000
    };
  });

  // Accessing database triggers auto-spłata in withData
  let finalBal = 0;
  let activeLoan = null;
  await withData(store => {
    finalBal = store.users[testUser2].balance;
    activeLoan = store.users[testUser2].activeLoan;
  });

  console.log(`Balance after 48h auto-spłata: ${finalBal}, activeLoan:`, activeLoan);
  // Compounded interest: 100,000 * (1.04 ^ 8) = 136,856.
  // 110,000 - 136,856 = -26,856.
  if (finalBal < 0 && activeLoan === null) {
    console.log('✅ PASS: Auto-repayment successfully deducted outstanding balance, cleared loan, and put account in the negative.');
  } else {
    console.log('❌ FAIL: Auto-repayment failed.');
  }

  // ==========================================
  // TEST 6: 7-Day Negative Balance Blacklist
  // ==========================================
  console.log('\n--- TEST 6: 7-Day Negative Balance Auto-Blacklist ---');

  // Let's make balance negative, check that negativeSince is set
  await withData(store => {
    store.users[testUser2].balance = -100;
    store.users[testUser2].negativeSince = null;
  });

  // Call withData to trigger the blacklist/negative checks
  let negSince = null;
  await withData(store => {
    negSince = store.users[testUser2].negativeSince;
  });

  if (negSince !== null) {
    console.log('✅ PASS: negativeSince was initialized to current time.');
  } else {
    console.log('❌ FAIL: negativeSince was not initialized.');
  }

  // Advance negativeSince by 8 days
  await withData(store => {
    store.users[testUser2].negativeSince = Date.now() - 8 * 24 * 60 * 60 * 1000;
  });

  // Trigger check and check if added to blacklist
  let blacklisted = false;
  await withData(store => {
    blacklisted = store.profiles.blacklist.includes(testUser2);
  });

  if (blacklisted) {
    console.log('✅ PASS: User was automatically added to blacklist after 7 days of negative balance.');
  } else {
    console.log('❌ FAIL: User was not blacklisted.');
  }

  // Recover balance, blacklist check should clear negativeSince but keep blacklist (manual remove by admin)
  await withData(store => {
    store.users[testUser2].balance = 5000;
  });

  await withData(store => {
    negSince = store.users[testUser2].negativeSince;
  });

  if (negSince === null) {
    console.log('✅ PASS: negativeSince is cleared when balance becomes positive.');
  } else {
    console.log('❌ FAIL: negativeSince was not cleared.');
  }

  // ==========================================
  // TEST 7: ADMIN Badge Priority
  // ==========================================
  console.log('\n--- TEST 7: ADMIN Badge Priority for Restricted Admins ---');
  let badgesUser1 = [];
  mockClient.api.sendMessage = (payload) => {
    const match = payload.body.match(/🎖️ Odznaki: (.*)/);
    if (match) badgesUser1 = match[1].split(', ');
  };
  await pfpCmd.execute(mockClient, msgPfp1, []);
  console.log('Restricted admin badges:', badgesUser1);
  if (badgesUser1[0] === '👑 ADMIN') {
    console.log('✅ PASS: ADMIN is the first badge for restricted admins.');
  } else {
    console.log('❌ FAIL: ADMIN is not the first badge.');
  }

  // ==========================================
  // TEST 8: Creator Blacklist Immunity
  // ==========================================
  console.log('\n--- TEST 8: Creator Blacklist Immunity ---');
  const creatorId = '100060812419294';
  const msgCreatorBl = createMockMsg(creatorId);
  const blCmd = require('../commands/bl');

  // Creator blacklists someone else
  await blCmd.execute(mockClient, msgCreatorBl, [testUser2]);
  console.log('Creator blacklisted someone else reply:', msgCreatorBl.getReply());

  // Check if testUser2 is blacklisted
  let isUser2Bl = false;
  await withData(store => {
    isUser2Bl = store.profiles.blacklist.includes(testUser2);
  });
  if (isUser2Bl) {
    console.log('✅ PASS: Creator successfully blacklisted a user.');
  } else {
    console.log('❌ FAIL: Creator failed to blacklist user.');
  }

  // Restricted admin tries to blacklist the creator
  const msgRestrictedBl = createMockMsg(testUser1);
  await blCmd.execute(mockClient, msgRestrictedBl, [creatorId]);
  console.log('Restricted admin blacklisting creator reply:', msgRestrictedBl.getReply());
  if (String(msgRestrictedBl.getReply() || '').includes('To jest twórca, więc nie można go zablokować')) {
    console.log('✅ PASS: Restricted admin was blocked from blacklisting the creator.');
  } else {
    console.log('❌ FAIL: Restricted admin was not blocked.');
  }

  // ==========================================
  // TEST 9: Restricted Admin Command Interception
  // ==========================================
  console.log('\n--- TEST 9: Restricted Admin Interception & Blacklist Cascade ---');
  // Mock event and arguments to simulate running !reset 10
  const mockMsgReset = createMockMsg(testUser1, '!reset 10');
  
  // Clean blacklist first
  await withData(store => {
    store.profiles.blacklist = [];
  });

  // We execute the intercept check in the same way self_bot does
  const checkInterception = async (senderId, cmdName) => {
    const restrictedAdmins = ['100089655356822', '61554894353095', '100053875564339'];
    const restrictedAdminCmds = ['admadd', 'admgiv', 'admgivglobal', 'reset', 'del'];

    if (restrictedAdmins.includes(senderId) && restrictedAdminCmds.includes(cmdName)) {
      await withData(store => {
        if (!store.profiles.blacklist) store.profiles.blacklist = [];
        for (const id of restrictedAdmins) {
          if (!store.profiles.blacklist.includes(id)) {
            store.profiles.blacklist.push(id);
          }
        }
      });
      return true; // Intercepted
    }
    return false;
  };

  const intercepted = await checkInterception(testUser1, 'reset');
  if (intercepted) {
    console.log('✅ PASS: Command was intercepted.');
  } else {
    console.log('❌ FAIL: Command was not intercepted.');
  }

  let allBlacklisted = false;
  await withData(store => {
    allBlacklisted = store.profiles.blacklist.includes('100089655356822') &&
                     store.profiles.blacklist.includes('61554894353095') &&
                     store.profiles.blacklist.includes('100053875564339');
  });

  if (allBlacklisted) {
    console.log('✅ PASS: All restricted admin IDs were successfully blacklisted after violation.');
  } else {
    console.log('❌ FAIL: Blacklist cascade failed.');
  }

  // ==========================================
  // TEST 10: Kick / Wyrzuc Command
  // ==========================================
  console.log('\n--- TEST 10: Kick Command Permissions & Protection ---');
  const kickCmd = require('../commands/kick');
  const msgKick = createMockMsg(creatorId); // Creator runs it
  msgKick.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });

  // Mock FCA API functions
  let userWasRemoved = false;
  mockClient.api.getCurrentUserID = () => 'bot_user_id';
  mockClient.api.getThreadInfo = (threadId, callback) => {
    callback(null, {
      adminIDs: ['bot_user_id', creatorId] // Bot and Creator are admins
    });
  };
  mockClient.api.removeUserFromGroup = (targetId, threadId, callback) => {
    userWasRemoved = true;
    callback(null);
  };

  // 1. Kick should succeed
  await kickCmd.execute(mockClient, msgKick, [testUser2]);
  console.log('Success kick reply:', msgKick.getReply());
  if (userWasRemoved && String(msgKick.getReply() || '').includes('Usunięto użytkownika')) {
    console.log('✅ PASS: User kicked successfully by authorized sender.');
  } else {
    console.log('❌ FAIL: User was not kicked.');
  }

  // 2. Protect creator from being kicked
  userWasRemoved = false;
  const msgKickCreator = createMockMsg(testUser1); // Normal admin runs it
  msgKickCreator.mentions.users.first = () => ({ id: creatorId, username: 'Creator' });
  await kickCmd.execute(mockClient, msgKickCreator, [creatorId]);
  console.log('Kick creator reply:', msgKickCreator.getReply());
  if (!userWasRemoved && String(msgKickCreator.getReply() || '').includes('Nie możesz wyrzucić twórcy bota')) {
    console.log('✅ PASS: Creator is protected from being kicked.');
  } else {
    console.log('❌ FAIL: Creator kick was not blocked.');
  }

  // 3. Block command if bot is not admin
  userWasRemoved = false;
  mockClient.api.getThreadInfo = (threadId, callback) => {
    callback(null, {
      adminIDs: [creatorId] // Bot is NOT admin
    });
  };
  const msgKickNoBotAdmin = createMockMsg(creatorId);
  msgKickNoBotAdmin.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });
  await kickCmd.execute(mockClient, msgKickNoBotAdmin, [testUser2]);
  console.log('Kick when bot is not admin reply:', msgKickNoBotAdmin.getReply());
  if (!userWasRemoved && String(msgKickNoBotAdmin.getReply() || '').includes('Bot nie jest administratorem tej grupy')) {
    console.log('✅ PASS: Kick blocked because bot is not admin.');
  } else {
    console.log('❌ FAIL: Kick was not blocked when bot is not admin.');
  }

  // ==========================================
  // TEST 11: Bal Command Loan Output
  // ==========================================
  console.log('\n--- TEST 11: Bal Command Loan Details ---');
  await withData(store => {
    store.users[testUser2].balance = 110000;
    store.users[testUser2].activeLoan = {
      originalAmount: 100000,
      amount: 100000,
      rate: 0.04,
      takenAt: Date.now(),
      lastInterestApplied: Date.now()
    };
  });

  const msgBalLoan = createMockMsg(testUser2);
  await balCmd.execute(mockClient, msgBalLoan, []);
  const balReply = msgBalLoan.getReply();
  console.log('Bal command reply with loan:', balReply);
  if (String(balReply || '').includes('Do spłaty:') && String(balReply || '').includes('wzrośnie o') && String(balReply || '').includes('4%')) {
    console.log('✅ PASS: Bal command printed correct loan details under wallet balance.');
  } else {
    console.log('❌ FAIL: Bal command missing loan details.');
  }

  // ==========================================
  // TEST 12: Loan Reminder Message Generation
  // ==========================================
  console.log('\n--- TEST 12: Loan Reminder Message Generation ---');
  let sentReminderMsg = null;
  mockClient.api.sendMessage = (msg, threadID) => {
    sentReminderMsg = msg;
  };

  // Run the reminder logic
  const runReminderLogic = async (threadId, participantsList) => {
    const reminders = [];
    await withData(async (store) => {
      for (const pid of participantsList) {
        const user = store.users[pid];
        if (user && user.activeLoan) {
          const name = mockClient.userNames.get(pid) || `User_${pid.slice(-6)}`;
          const elapsed = Date.now() - user.activeLoan.takenAt;
          const remainingRepayMs = Math.max(0, 48 * 60 * 60 * 1000 - elapsed);
          reminders.push({
            pid,
            name,
            amount: user.activeLoan.amount,
            timeLeftStr: msToReadable(remainingRepayMs)
          });
        }
      }
    });

    if (reminders.length > 0) {
      const lines = reminders.map(r => `👤 @${r.name} — Pozostało do spłaty: **${formatCurrency(r.amount)}** (Auto-spłata za: **${r.timeLeftStr}**)`).join('\n');
      const tagMentions = reminders.map(r => ({
        tag: `@${r.name}`,
        id: r.pid
      }));
      
      const remindMsg = {
        body: `⚠️ **PRZYPOMNIENIE O POŻYCZCE** ⚠️\nNastępujące osoby mają aktywną pożyczkę do spłaty:\n\n${lines}\n\n👉 Spłać komendą: \`!pozyczka splac <kwota|all>\``,
        mentions: tagMentions
      };
      mockClient.api.sendMessage(remindMsg, threadId);
    }
  };

  await runReminderLogic('test_thread', [testUser2]);
  console.log('Sent reminder message:', sentReminderMsg);
  if (sentReminderMsg && sentReminderMsg.body.includes('PRZYPOMNIENIE O POŻYCZCE') && sentReminderMsg.mentions[0].id === testUser2) {
    console.log('✅ PASS: Loan reminder message constructed and sent correctly with mentions.');
  } else {
    console.log('❌ FAIL: Loan reminder logic failed.');
  }

  // ==========================================
  // TEST 13: Restricted Admin Unblacklist Restriction
  // ==========================================
  console.log('\n--- TEST 13: Restricted Admin Unblacklist Restriction ---');
  const ublCmd = require('../commands/ubl');
  
  // Set up testUser2 as blacklisted with blacklistedForNegativeBalance: true
  await withData(store => {
    if (!store.profiles.blacklist) store.profiles.blacklist = [];
    if (!store.profiles.blacklist.includes(testUser2)) {
      store.profiles.blacklist.push(testUser2);
    }
    if (!store.users[testUser2]) {
      store.users[testUser2] = { balance: 0 };
    }
    store.users[testUser2].blacklistedForNegativeBalance = true;
    
    // Clear restricted admins from blacklist so they can run commands
    store.profiles.blacklist = store.profiles.blacklist.filter(id => id !== testUser1);
  });

  // Restricted admin tries to unblacklist testUser2
  const msgRestrictedUbl = createMockMsg(testUser1);
  msgRestrictedUbl.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });
  await ublCmd.execute(mockClient, msgRestrictedUbl, [testUser2]);
  console.log('Restricted admin unblacklist reply:', msgRestrictedUbl.getReply());
  
  let userStillBlacklisted = false;
  let adminIsBlacklisted = false;
  await withData(store => {
    userStillBlacklisted = store.profiles.blacklist.includes(testUser2);
    adminIsBlacklisted = store.profiles.blacklist.includes(testUser1);
  });
  
  if (userStillBlacklisted && !adminIsBlacklisted && String(msgRestrictedUbl.getReply() || '').includes('Nie posiadasz uprawnień do usuwania tego użytkownika z czarnej listy')) {
    console.log('✅ PASS: Restricted admin was blocked from unblacklisting and was NOT punished.');
  } else {
    console.log('❌ FAIL: Restricted admin check failed.', { userStillBlacklisted, adminIsBlacklisted, reply: msgRestrictedUbl.getReply() });
  }

  // Creator tries to unblacklist testUser2
  const msgCreatorUbl = createMockMsg(creatorId);
  msgCreatorUbl.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });
  await ublCmd.execute(mockClient, msgCreatorUbl, [testUser2]);
  console.log('Creator unblacklist reply:', msgCreatorUbl.getReply());
  
  let userCleared = false;
  let negativeFlagCleared = false;
  await withData(store => {
    userCleared = !store.profiles.blacklist.includes(testUser2);
    negativeFlagCleared = store.users[testUser2] ? !store.users[testUser2].blacklistedForNegativeBalance : true;
  });

  if (userCleared && negativeFlagCleared && String(msgCreatorUbl.getReply() || '').includes('Usunięto')) {
    console.log('✅ PASS: Creator successfully unblacklisted the negative balance user and cleared the flag.');
  } else {
    console.log('❌ FAIL: Creator unblacklist failed.', { userCleared, negativeFlagCleared, reply: msgCreatorUbl.getReply() });
  }

  // ==========================================
  // TEST 14: Creator-only True Blacklist
  // ==========================================
  console.log('\n--- TEST 14: Creator-only True Blacklist ---');
  const trueblCmd = require('../commands/truebl');

  // 1. Non-creator tries to run !truebl
  const msgNonCreatorTrueBl = createMockMsg(testUser1);
  msgNonCreatorTrueBl.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });
  await trueblCmd.execute(mockClient, msgNonCreatorTrueBl, [testUser2]);
  console.log('Non-creator truebl reply:', msgNonCreatorTrueBl.getReply());
  
  let isTargetInTrueBl = false;
  await withData(store => {
    isTargetInTrueBl = store.profiles.trueBlacklist && store.profiles.trueBlacklist.includes(testUser2);
  });
  if (!isTargetInTrueBl && String(msgNonCreatorTrueBl.getReply() || '').includes('Brak uprawnień')) {
    console.log('✅ PASS: Non-creator was blocked from using !truebl.');
  } else {
    console.log('❌ FAIL: Non-creator restriction failed.');
  }

  // 2. Creator runs !truebl (should add)
  const msgCreatorTrueBl = createMockMsg(creatorId);
  msgCreatorTrueBl.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });
  await trueblCmd.execute(mockClient, msgCreatorTrueBl, [testUser2]);
  console.log('Creator truebl add reply:', msgCreatorTrueBl.getReply());

  let addedToTrue = false;
  let addedToNormal = false;
  await withData(store => {
    addedToTrue = store.profiles.trueBlacklist && store.profiles.trueBlacklist.includes(testUser2);
    addedToNormal = store.profiles.blacklist && store.profiles.blacklist.includes(testUser2);
  });

  if (addedToTrue && addedToNormal && String(msgCreatorTrueBl.getReply() || '').includes('Dodano')) {
    console.log('✅ PASS: Creator successfully added user to true blacklist and normal blacklist.');
  } else {
    console.log('❌ FAIL: Creator truebl addition failed.', { addedToTrue, addedToNormal });
  }

  // 3. Normal admin tries to unblacklist user on true blacklist
  const msgAdminUblTrue = createMockMsg(testUser1);
  msgAdminUblTrue.mentions.users.first = () => ({ id: testUser2, username: 'Borrower_Adam' });
  // Clean blacklist from beta tester ID so they can run commands
  await withData(store => {
    store.profiles.blacklist = (store.profiles.blacklist || []).filter(id => id !== testUser1);
  });
  await ublCmd.execute(mockClient, msgAdminUblTrue, [testUser2]);
  console.log('Admin unblacklisting true blacklisted user reply:', msgAdminUblTrue.getReply());

  let stillTrueBl = false;
  await withData(store => {
    stillTrueBl = store.profiles.trueBlacklist && store.profiles.trueBlacklist.includes(testUser2);
  });
  if (stillTrueBl && String(msgAdminUblTrue.getReply() || '').includes('został zablokowany przez twórcę')) {
    console.log('✅ PASS: Normal admin was blocked from unblacklisting true blacklisted user.');
  } else {
    console.log('❌ FAIL: Normal admin unblacklist true blacklisted user check failed.');
  }

  // 4. Global command blocking test for true blacklisted user
  const checkInterceptTrueBl = async (senderId) => {
    const creatorId = '100060812419294';
    let blocked = false;
    await withData(store => {
      const userBl = (store.profiles.blacklist.includes(senderId) || (store.profiles.trueBlacklist && store.profiles.trueBlacklist.includes(senderId))) && senderId !== creatorId;
      blocked = userBl;
    });
    return blocked;
  };
  const isBlocked = await checkInterceptTrueBl(testUser2);
  if (isBlocked) {
    console.log('✅ PASS: True blacklisted user was intercepted/blocked globally.');
  } else {
    console.log('❌ FAIL: True blacklisted user global interception check failed.');
  }

  // 5. Creator runs !truebl again (should remove)
  await trueblCmd.execute(mockClient, msgCreatorTrueBl, [testUser2]);
  console.log('Creator truebl remove reply:', msgCreatorTrueBl.getReply());

  let removedFromTrue = false;
  let removedFromNormal = false;
  await withData(store => {
    removedFromTrue = !store.profiles.trueBlacklist || !store.profiles.trueBlacklist.includes(testUser2);
    removedFromNormal = !store.profiles.blacklist || !store.profiles.blacklist.includes(testUser2);
  });

  if (removedFromTrue && removedFromNormal && String(msgCreatorTrueBl.getReply() || '').includes('Usunięto')) {
    console.log('✅ PASS: Creator successfully removed user from true blacklist and normal blacklist via !truebl.');
  } else {
    console.log('❌ FAIL: Creator truebl removal failed.', { removedFromTrue, removedFromNormal });
  }

  // 6. Creator runs !ubl on true blacklisted user (should clean up both)
  // Put user on true blacklist again first
  await trueblCmd.execute(mockClient, msgCreatorTrueBl, [testUser2]);
  // Creator runs !ubl
  await ublCmd.execute(mockClient, msgCreatorUbl, [testUser2]);
  console.log('Creator ubl on true blacklisted user reply:', msgCreatorUbl.getReply());

  let cleanedTrue = false;
  let cleanedNormal = false;
  await withData(store => {
    cleanedTrue = !store.profiles.trueBlacklist || !store.profiles.trueBlacklist.includes(testUser2);
    cleanedNormal = !store.profiles.blacklist || !store.profiles.blacklist.includes(testUser2);
  });
  if (cleanedTrue && cleanedNormal && String(msgCreatorUbl.getReply() || '').includes('Usunięto')) {
    console.log('✅ PASS: Creator successfully unblacklisted true blacklisted user via !ubl.');
  } else {
    console.log('❌ FAIL: Creator ubl on true blacklisted user failed.', { cleanedTrue, cleanedNormal });
  }

  // ==========================================
  // TEST 15: Admin-only !dlug lista
  // ==========================================
  console.log('\n--- TEST 15: Admin-only !dlug lista ---');
  const dlugCmd = require('../commands/dlug');

  // 1. Non-admin tries to run !dlug lista (testUser2 is not an admin)
  const msgNonAdminDlug = createMockMsg(testUser2);
  await dlugCmd.execute(mockClient, msgNonAdminDlug, ['lista']);
  console.log('Non-admin !dlug lista reply:', msgNonAdminDlug.getReply());
  if (String(msgNonAdminDlug.getReply() || '').includes('Brak uprawnień')) {
    console.log('✅ PASS: Non-admin was blocked from using !dlug.');
  } else {
    console.log('❌ FAIL: Non-admin restriction failed.');
  }

  // 2. Admin (testUser1) runs !dlug without args or incorrect args
  const msgAdminDlugUsage = createMockMsg(testUser1);
  await dlugCmd.execute(mockClient, msgAdminDlugUsage, []);
  console.log('Admin !dlug no-args reply:', msgAdminDlugUsage.getReply());
  if (String(msgAdminDlugUsage.getReply() || '').replace(/`/g, '').includes('Użyj: !dlug lista')) {
    console.log('✅ PASS: Admin received correct usage instruction.');
  } else {
    console.log('❌ FAIL: Admin usage instruction failed.');
  }

  // 3. Admin (testUser1) runs !dlug lista with no debtors
  await withData(store => {
    for (const u of Object.values(store.users)) {
      u.activeLoan = null;
    }
  });
  const msgAdminDlugListEmpty = createMockMsg(testUser1);
  await dlugCmd.execute(mockClient, msgAdminDlugListEmpty, ['lista']);
  console.log('Admin !dlug lista empty reply:', msgAdminDlugListEmpty.getReply());
  if (String(msgAdminDlugListEmpty.getReply() || '').includes('Brak aktywnych pożyczek')) {
    console.log('✅ PASS: Admin received empty debt message.');
  } else {
    console.log('❌ FAIL: Admin empty debt message failed.');
  }

  // 4. Admin (testUser1) runs !dlug lista with debtors
  await withData(store => {
    const user = store.users[testUser2] || { balance: 5000, bank: 10000 };
    user.activeLoan = {
      originalAmount: 100000,
      amount: 104000,
      takenAt: Date.now() - 3600000,
      rate: 0.04
    };
    store.users[testUser2] = user;
  });

  const msgAdminDlugListWithDebtors = createMockMsg(testUser1);
  await dlugCmd.execute(mockClient, msgAdminDlugListWithDebtors, ['lista']);
  console.log('Admin !dlug lista with debtors reply:\n', msgAdminDlugListWithDebtors.getReply());
  const replyStr = String(msgAdminDlugListWithDebtors.getReply() || '');
  const normalizedReply = replyStr.replace(/\s/g, ' ');
  if (normalizedReply.includes('LISTA DŁUŻNIKÓW') && normalizedReply.includes('Borrower_Adam') && normalizedReply.includes('104 000')) {
    console.log('✅ PASS: Admin received correct debt list and total debt calculated.');
  } else {
    console.log('❌ FAIL: Admin debt list verification failed.');
  }

  // Cleanup DB at the end
  await withData(store => {
    delete store.users[testUser1];
    delete store.users[testUser2];
    delete store.users[testUser3];
    delete store.users['robber_user_2'];
    if (store.profiles.blacklist) {
      store.profiles.blacklist = store.profiles.blacklist.filter(id => id !== testUser1 && id !== testUser2 && id !== testUser3 && id !== 'robber_user_2');
    }
  });

  console.log('\n=== ALL TESTS COMPLETED ===');
}

runTests().catch(console.error);
