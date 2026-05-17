module.exports = client => {
  process.on('unhandledRejection', error => {
    console.error('[PROCESS] Unhandled rejection:', error);
  });

  process.on('uncaughtException', error => {
    console.error('[PROCESS] Uncaught exception:', error);
  });

  client.on('error', error => {
    console.error('[CLIENT] Discord client error:', error);
  });
};
