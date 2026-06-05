const fs = require('fs');
const login = require('@dongdev/fca-unofficial');

const appState = JSON.parse(fs.readFileSync('./appstate.json', 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Login error:', err);
    process.exit(1);
  }

  console.log('Login successful! Listening to ALL MQTT events. Please send a message to the bot on PV now...');
  
  api.setOptions({
    listenEvents: true,
    selfListen: false,
    autoMarkRead: false
  });

  api.listenMqtt((listenErr, event) => {
    if (listenErr) {
      console.error('MQTT Listen error:', listenErr);
      return;
    }

    console.log(`\n[EVENT RECEIVED] Type: ${event.type}, ThreadID: ${event.threadID}, SenderID: ${event.senderID}`);
    console.log('Event details:', JSON.stringify(event, null, 2));
  });
});
