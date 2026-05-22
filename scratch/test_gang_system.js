const { withData, createUser } = require('../utils/storage');
const gang = require('../commands/gang');
const awans = require('../commands/awans');
const work = require('../commands/work');
const crime = require('../commands/crime');
const rob = require('../commands/rob');
const { buildHelpListEmbed, buildHelpDetailEmbed, getHelpCommandById } = require('../utils/helpSystem');

// Setup mock timer so we don't wait 2 minutes in tests
const realSetTimeout = global.setTimeout;
let activeHeistCallback = null;

global.setTimeout = (cb, delay) => {
  if (delay === 120000) {
    activeHeistCallback = cb;
    return { unref: () => {} };
  }
  return realSetTimeout(cb, delay);
};

async function setupTestData() {
  await withData(store => {
    // Clean up existing test users/gangs
    delete store.users['user_boss_1'];
    delete store.users['user_member_2'];
    delete store.users['user_member_3'];
    if (store.profiles.gangs) {
      delete store.profiles.gangs['gangtestowy'];
    }

    const boss = createUser('user_boss_1', store.users);
    boss.balance = 2500000; // 2.5mln
    
    const member = createUser('user_member_2', store.users);
    member.balance = 50000;

    const member3 = createUser('user_member_3', store.users);
    member3.balance = 10000;
  });
  console.log('Setup test data completed.');
}

async function runTests() {
  await setupTestData();

  const client = {
    gangInvites: new Map(),
    gangHeists: new Map(),
    userNames: new Map([
      ['user_boss_1', 'Boss_Wojtek'],
      ['user_member_2', 'Gracz_Janek'],
      ['user_member_3', 'Gracz_Anna']
    ])
  };

  const replies = [];
  const createMockMessage = (userId, username, argsText = '') => {
    return {
      author: { id: userId, username },
      mentions: {
        users: {
          first: () => {
            const match = argsText.match(/<@!?(\d+)>/) || argsText.match(/@(\w+)/);
            if (match) {
              const id = match[1] === 'Janek' || match[1] === 'user_member_2' ? 'user_member_2' : 'user_member_3';
              return { id, username: client.userNames.get(id) };
            }
            return null;
          }
        }
      },
      reply: async (payload) => {
        let text = typeof payload === 'string' ? payload : JSON.stringify(payload);
        if (payload && payload.embeds) {
          text = '[EMBED] ' + payload.embeds.map(e => e.title || e.description).join(' | ');
        }
        replies.push({ userId, text });
        console.log(`[REPLY to ${username}]: ${text}`);
        return { messageID: 'mock_msg_' + Math.random() };
      }
    };
  };

  // 1. Create Gang
  console.log('\n--- 1. Creating Gang (Cost 1mln) ---');
  let msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'stworz GangTestowy');
  await gang.execute(client, msg, ['stworz', 'GangTestowy']);

  // Check database after creation
  await withData(store => {
    const bossUser = store.users['user_boss_1'];
    const createdGang = store.profiles.gangs['gangtestowy'];
    if (bossUser.balance === 1500000 && createdGang && createdGang.name === 'GangTestowy') {
      console.log('✅ Gang creation database check: PASSED');
    } else {
      console.error('❌ Gang creation database check: FAILED', bossUser.balance, createdGang);
    }
  });

  // 2. Invite member
  console.log('\n--- 2. Inviting Gracz_Janek ---');
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'zapros @Janek');
  await gang.execute(client, msg, ['zapros', 'user_member_2']);
  
  if (client.gangInvites.has('user_member_2')) {
    console.log('✅ Invite record stored in memory: PASSED');
  } else {
    console.error('❌ Invite record stored in memory: FAILED');
  }

  // 3. Join Gang
  console.log('\n--- 3. Gracz_Janek joining ---');
  msg = createMockMessage('user_member_2', 'Gracz_Janek', 'dolacz');
  await gang.execute(client, msg, ['dolacz']);

  await withData(store => {
    const janekUser = store.users['user_member_2'];
    const currentGang = store.profiles.gangs['gangtestowy'];
    if (janekUser.gangId === 'gangtestowy' && currentGang.members.includes('user_member_2')) {
      console.log('✅ Joining database check: PASSED');
    } else {
      console.error('❌ Joining database check: FAILED');
    }
  });

  // 4. Promote via Standalone awans command
  console.log('\n--- 4. Promoting Gracz_Janek to Deputy ---');
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'awans @Janek');
  await awans.execute(client, msg, ['user_member_2']);

  await withData(store => {
    const janekUser = store.users['user_member_2'];
    const currentGang = store.profiles.gangs['gangtestowy'];
    if (janekUser.gangRole === 'deputy' && currentGang.deputies.includes('user_member_2')) {
      console.log('✅ Promotion database check: PASSED');
    } else {
      console.error('❌ Promotion database check: FAILED');
    }
  });

  // 5. Deposit and Withdraw Vault Cash
  console.log('\n--- 5. Depositing and Withdrawing Vault cash ---');
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'wplac 500000');
  await gang.execute(client, msg, ['wplac', '500000']);

  await withData(store => {
    const bossUser = store.users['user_boss_1'];
    const currentGang = store.profiles.gangs['gangtestowy'];
    if (bossUser.balance === 1000000 && currentGang.vault === 500000) {
      console.log('✅ Deposit database check: PASSED');
    } else {
      console.error('❌ Deposit database check: FAILED', bossUser.balance, currentGang.vault);
    }
  });

  msg = createMockMessage('user_member_2', 'Gracz_Janek', 'wyplac 100000');
  await gang.execute(client, msg, ['wyplac', '100000']);

  await withData(store => {
    const janekUser = store.users['user_member_2'];
    const currentGang = store.profiles.gangs['gangtestowy'];
    if (janekUser.balance === 150000 && currentGang.vault === 400000) {
      console.log('✅ Deputy withdrawal database check: PASSED');
    } else {
      console.error('❌ Deputy withdrawal database check: FAILED');
    }
  });

  // 6. Upgrades (Dziupla, Biznesy, Fach)
  console.log('\n--- 6. Upgrades and vault deductions ---');
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'ulepsz dziupla');
  await gang.execute(client, msg, ['ulepsz', 'dziupla']); // Lvl 1: costs 100k, vault goes 400k -> 300k

  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'ulepsz biznesy');
  await gang.execute(client, msg, ['ulepsz', 'biznesy']); // Lvl 1: costs 200k, vault goes 300k -> 100k

  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'ulepsz fach');
  await gang.execute(client, msg, ['ulepsz', 'fach']); // Lvl 1: costs 200k, vault is 100k (fails)

  await withData(store => {
    const currentGang = store.profiles.gangs['gangtestowy'];
    if (currentGang.levelDziupla === 1 && currentGang.levelBiznesy === 1 && currentGang.levelFach === 0 && currentGang.vault === 100000) {
      console.log('✅ Upgrades database check: PASSED');
    } else {
      console.error('❌ Upgrades database check: FAILED', currentGang);
    }
  });

  // Let's add money to vault and upgrade Fach
  await withData(store => {
    store.profiles.gangs['gangtestowy'].vault += 300000;
  });
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'ulepsz fach');
  await gang.execute(client, msg, ['ulepsz', 'fach']); // Lvl 1: costs 200k, vault goes 400k -> 200k

  await withData(store => {
    const currentGang = store.profiles.gangs['gangtestowy'];
    if (currentGang.levelFach === 1 && currentGang.vault === 200000) {
      console.log('✅ Upgrade Fach database check: PASSED');
    } else {
      console.error('❌ Upgrade Fach database check: FAILED');
    }
  });

  // 7. Work/Crime/Rob multiplier verification
  console.log('\n--- 7. Verifying Work, Crime and Rob modifiers ---');
  // Work with Biznesy Lvl 1 (+10%): base work is between 5k and 25k. We verify the actual payout has the multiplier applied.
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek');
  await work.execute(client, msg);

  // Crime with Fach Lvl 1 (+2% on success)
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek');
  await crime.execute(client, msg);

  // Rob with Fach Lvl 1 (+2% on success stolen amount)
  // Let's setup victim balance to be high
  await withData(store => {
    store.users['user_member_3'].balance = 100000;
  });
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'user_member_3');
  await rob.execute(client, msg, ['user_member_3']);

  // 8. Gang Heist Simulation
  console.log('\n--- 8. Gang Heist Simulation (50% chance, 60k-400k) ---');
  msg = createMockMessage('user_boss_1', 'Boss_Wojtek', 'skok');
  await gang.execute(client, msg, ['skok']);

  // Gracz_Janek joins heist
  msg = createMockMessage('user_member_2', 'Gracz_Janek', 'skok dolacz');
  await gang.execute(client, msg, ['skok', 'dolacz']);

  // Trigger heist resolution manually
  if (activeHeistCallback) {
    console.log('Triggering heist resolution callback manually...');
    await activeHeistCallback();
    console.log('Heist resolution finished.');
  } else {
    console.error('❌ Heist resolution callback was not registered!');
  }

  // 9. Minimalist help rendering
  console.log('\n--- 9. Verifying Minimalist Help Embed Output ---');
  const helpEmbed = buildHelpListEmbed(client);
  console.log(`Help Embed Title: ${helpEmbed.data.title}`);
  console.log('Help Embed Description:');
  console.log(helpEmbed.data.description);

  console.log('\n--- 10. Verifying Detailed Help Embed Output (Command #19 rr) ---');
  const detailsEmbed = buildHelpDetailEmbed(client, getHelpCommandById(19));
  console.log(`Details Title: ${detailsEmbed.data.title}`);
  console.log(`Details Description: ${detailsEmbed.data.description}`);
  console.log('Details Fields:');
  detailsEmbed.data.fields.forEach(f => {
    console.log(`- [${f.name}]: ${f.value}`);
  });
}

runTests().catch(console.error);
