const config = require('../config/config');
const { appendLog } = require('./storage');

function addLog(logsData, type, payload = {}) {
  return appendLog(logsData, {
    type,
    ...payload
  });
}

async function logToChannel(client, embed) {
  if (!config.logRecipientId) {
    return;
  }

  try {
    await client.sendText(config.logRecipientId, { embeds: [embed] });
  } catch (error) {
    console.error('[LOG] Failed to send Messenger log:', error.message);
  }
}

module.exports = {
  addLog,
  logToChannel
};
