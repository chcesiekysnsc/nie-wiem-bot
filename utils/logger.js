const { ChannelType } = require('discord.js');
const config = require('../config/config');
const { appendLog } = require('./storage');

function addLog(logsData, type, payload = {}) {
  return appendLog(logsData, {
    type,
    ...payload
  });
}

async function logToChannel(client, embed) {
  if (!config.logChannelId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(config.logChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return;
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[LOG] Failed to send log embed:', error.message);
  }
}

module.exports = {
  addLog,
  logToChannel
};
