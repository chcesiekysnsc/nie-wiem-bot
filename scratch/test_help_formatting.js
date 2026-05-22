const { buildHelpListEmbed } = require('../utils/helpSystem');

const embed = buildHelpListEmbed(null);
const fullText = embed.toMessageText();

console.log('=== CONVERTED TEXT TO MESSENGER ===');
console.log(fullText);
console.log('===================================');
