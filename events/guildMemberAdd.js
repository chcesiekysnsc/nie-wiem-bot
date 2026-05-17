const { createUser, withData } = require('../utils/storage');

module.exports = client => {
  client.on('guildMemberAdd', async member => {
    try {
      await withData(store => {
        createUser(member.id, store.users);
      });
    } catch (error) {
      console.error('[EVENT] guildMemberAdd failed:', error);
    }
  });
};
