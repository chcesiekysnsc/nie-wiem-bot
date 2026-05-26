const { withData, createUser } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');
const pozyczkaCmd = require('../commands/pozyczka');

async function runTest() {
  console.log('=== RUNNING LOAN NEGATIVE BALANCE RESTRICTION TEST ===\n');

  const testUser = 'test_neg_loan_user';

  // 1. Reset user accounts and give them 150 commands used but NEGATIVE balance (-1000)
  await withData(store => {
    delete store.users[testUser];
    const u = createUser(testUser, store.users);
    u.balance = -1000;
    u.commandsUsed = 150;
  });

  const mockClient = {
    userNames: new Map([[testUser, 'Neg_Tester']]),
  };

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
      getReply: () => capturedReply
    };
  };

  const msgBorrow = createMockMsg(testUser);
  await pozyczkaCmd.execute(mockClient, msgBorrow, ['100000']);
  
  const reply = msgBorrow.getReply();
  console.log('Borrow attempt reply:', reply);

  let activeLoan = null;
  await withData(store => {
    activeLoan = store.users[testUser]?.activeLoan;
  });

  if (activeLoan === undefined || activeLoan === null) {
    if (String(reply).includes('ujemne saldo')) {
      console.log('✅ PASS: Loan was successfully blocked due to negative balance.');
    } else {
      console.log('❌ FAIL: Loan was blocked but returned an unexpected message:', reply);
    }
  } else {
    console.log('❌ FAIL: Loan was created despite negative balance! activeLoan:', activeLoan);
  }

  // Cleanup
  await withData(store => {
    delete store.users[testUser];
  });

  console.log('\n=== TEST FINISHED ===');
}

runTest().catch(console.error);
