module.exports = client => {
  client.once('ready', () => {
    console.log(`[BOT] Logged in as ${client.user.tag}`);

    if (!client.user) {
      return;
    }

    client.user.setPresence({
      activities: [{ name: '!daily | !slots | !pfp' }],
      status: 'online'
    });
  });
};
