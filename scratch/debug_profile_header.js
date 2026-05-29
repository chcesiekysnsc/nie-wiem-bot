const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'lastfm_profile.html'), 'utf8');

// Display name: usually inside <h1 class="header-title">...</h1>
const displayMatch = html.match(/<h1 class="header-title">([\s\S]*?)<\/h1>/i) ||
                     html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

// Playcount: usually inside class="header-metadata-display" or near playcount
// Let's find "scrobbles" or "plays" in metadata
const scrobblesMatch = html.match(/<a[^>]*href="\/user\/[^"]*\/library"[^>]*>([\s\S]*?)<\/a>/gi) ||
                       html.match(/<span class="header-metadata-display">([\s\S]*?)<\/span>/gi) ||
                       html.match(/(\d[\d,\s]*) scrobbles/i);

// Avatar: usually <img class="avatar" src="..." /> or inside <div class="header-avatar">
const avatarMatch = html.match(/<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/i) ||
                    html.match(/<div class="header-avatar">[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
                    html.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*avatar/i);

// Registration date: usually <span class="header-scrobble-since">...</span>
const registeredMatch = html.match(/scrobbling since([\s\S]*?)<\/span>/i) ||
                        html.match(/class="header-scrobble-since"[^>]*>([\s\S]*?)<\/span>/i);

console.log('Display Name Raw:', displayMatch ? displayMatch[1].trim() : 'Not found');
console.log('Scrobbles Matches:', scrobblesMatch);
console.log('Avatar Raw:', avatarMatch ? avatarMatch[1].trim() : 'Not found');
console.log('Registered Raw:', registeredMatch ? registeredMatch[1].trim() : 'Not found');
