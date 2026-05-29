const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'lastfm_profile.html'), 'utf8');

function parseSection(id) {
  const parts = html.split(new RegExp(`id="${id}"`, 'i'));
  if (parts.length < 2) return [];
  
  const sectionContent = parts[1].slice(0, 35000);
  const items = [];
  
  if (sectionContent.includes('chartlist-row')) {
    const rows = sectionContent.split(/<tr\s+class="[^"]*chartlist-row/i);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const nameMatch = row.match(/class="chartlist-name"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                        row.match(/class="chartlist-artist"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      const countMatch = row.match(/class="chartlist-count-bar-value"[^>]*>([\s\S]*?)<\/span>/i) ||
                         row.match(/class="chartlist-count-bar-link"[^>]*>([\s\S]*?)<\/a>/i);
      
      if (nameMatch) {
        let name = nameMatch[1].trim().replace(/<[^>]+>/g, '');
        let count = countMatch ? countMatch[1].trim().replace(/<[^>]+>/g, '') : '';
        
        const artistMatch = row.match(/class="chartlist-artist"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        let artist = artistMatch ? artistMatch[1].trim().replace(/<[^>]+>/g, '') : '';
        
        name = decodeHTML(name);
        artist = decodeHTML(artist);
        count = decodeHTML(count);
        
        items.push({ name, artist, count });
      }
    }
  } else {
    // Corrected regex to match class with newlines and indentation
    const gridRegex = /<li[^>]*class="[^"]*grid-items-item[\s\S]*?<\/li>/gi;
    let m;
    while ((m = gridRegex.exec(sectionContent)) !== null) {
      const block = m[0];
      
      const nameMatch = block.match(/class="grid-items-item-main-text"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      
      // For grid-items-item-aux-text, it could contain two anchors (artist and count)
      // Let's match all anchors inside class="grid-items-item-aux-text"
      const auxSectionMatch = block.match(/class="grid-items-item-aux-text"([\s\S]*?)<\/p>/i) ||
                              block.match(/class="grid-items-item-aux-text"([\s\S]*?)<\/div>/i);
      
      let artist = '';
      let count = '';
      
      if (auxSectionMatch) {
        const auxContent = auxSectionMatch[1];
        // Find all anchors in auxContent
        const anchors = [];
        const anchorRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
        let am;
        while ((am = anchorRegex.exec(auxContent)) !== null) {
          anchors.push(am[1].trim().replace(/<[^>]+>/g, ''));
        }
        
        if (anchors.length >= 2) {
          artist = anchors[0];
          count = anchors[1];
        } else if (anchors.length === 1) {
          // If 1 anchor, it could be plays count (if it contains 'plays') or artist name
          if (anchors[0].includes('play') || anchors[0].includes('scrobble')) {
            count = anchors[0];
          } else {
            artist = anchors[0];
          }
        }
      }
      
      if (nameMatch) {
        let name = nameMatch[1].trim().replace(/<[^>]+>/g, '');
        name = decodeHTML(name);
        artist = decodeHTML(artist);
        count = decodeHTML(count);
        
        items.push({ name, artist, count });
      }
    }
  }
  
  return items;
}

function decodeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .trim();
}

console.log('--- Top Artists ---');
console.log(parseSection('top-artists'));

console.log('--- Top Albums ---');
console.log(parseSection('top-albums'));

console.log('--- Top Tracks ---');
console.log(parseSection('top-tracks'));
