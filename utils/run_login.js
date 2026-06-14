const { runAutomatedLogin } = require('./login_automator');

runAutomatedLogin().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('[RUN-LOGIN] Fatal error:', err);
  process.exit(1);
});
