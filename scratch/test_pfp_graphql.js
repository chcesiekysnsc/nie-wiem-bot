const login = require('@dongdev/fca-unofficial');
const fs = require('fs');
const path = require('path');
const pfp = require('../commands/pfp');

const appStatePath = path.join(__dirname, '..', 'appstate.json');
const appState = JSON.parse(fs.readFileSync(appStatePath, 'utf8'));

// Mock economy and storage helper dependencies
const storage = require('../utils/storage');

login({ appState }, (err, api) => {
  if (err) {
    console.error('Login failed:', err);
    process.exit(1);
  }

  const client = {
    api: api,
    userNames: new Map(),
    commands: new Map()
  };

  const targetId = '61560227271099';

  const mockMessage = {
    guild: { id: 'test_thread_1' },
    rawEvent: { threadID: 'test_thread_1', messageID: 'mid_123' },
    author: { id: targetId },
    mentions: { users: { first: () => null } },
    reply: async (text) => {
      console.log('Reply received:');
      console.log(text);
    }
  };

  // Mock api.sendMessage to see what attachment it sends
  const originalSendMessage = api.sendMessage;
  api.sendMessage = function(msgObj, threadID, callback, messageID) {
    console.log('--- api.sendMessage called ---');
    console.log('Body:', msgObj.body);
    console.log('Attachment path exists:', fs.existsSync(msgObj.attachment.path));
    console.log('Attachment path:', msgObj.attachment.path);
    console.log('------------------------------');
    // Don't actually send it over network during test, or we can send it.
    // Let's print details and exit.
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  };

  console.log('Executing pfp command...');
  pfp.execute(client, mockMessage, []).catch(err => {
    console.error('Command failed:', err);
    process.exit(1);
  });
});
