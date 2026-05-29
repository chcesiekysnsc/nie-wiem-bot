const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'lastfm_profile.html'), 'utf8');

function parseSection(id) {
  const parts = html.split(new RegExp(`id="${id}"`, 'i'));
  if (parts.length < 2) return [];
  
  // The section content is from id="section" until the next closing section/div (let's say 25000 characters to be safe)
  const sectionContent = parts[1].slice(0, 35000);
  
  // We can split by '<tr' or 'class="chartlist-row' or grid items
  // Let's see if it contains grid items (often top artists/albums are rendered in a grid or chartlist)
  // Let's print unique links to /music/ inside this section
  const items = [];
  
  // Look for chartlist-row
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
        
        // Also look for artist on tracks
        const artistMatch = row.match(/class="chartlist-artist"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        let artist = artistMatch ? artistMatch[1].trim().replace(/<[^>]+>/g, '') : '';
        
        name = decodeHTML(name);
        artist = decodeHTML(artist);
        count = decodeHTML(count);
        
        items.push({ name, artist, count });
      }
    }
  } else {
    // If not chartlist-row, it's grid items (like grid-items-item)
    // Let's find all grid items: <div class="grid-items-item"...> or similar
    // Let's use regex to find grid items:
    const gridRegex = /<li class="grid-items-item[\s\S]*?<\/li>/gi;
    let m;
    while ((m = gridRegex.exec(sectionContent)) !== null) {
      const block = m[0];
      // Extract main name (artist or album name)
      const nameMatch = block.match(/class="grid-items-item-main-text"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      // Extract aux text (e.g. artist of album, or playcount)
      const auxMatch = block.match(/class="grid-items-item-aux-text"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                       block.match(/class="grid-items-item-aux-text"[^>]*>([\s\S]*?)<\/p>/i) ||
                       block.match(/class="grid-items-item-aux-text"[^>]*>([\s\S]*?)<\/span>/i) ||
                       block.match(/class="grid-items-item-aux-text"[^>]*>([\s\S]*?)$/i); // fallback
      
      if (nameMatch) {
        let name = nameMatch[1].trim().replace(/<[^>]+>/g, '');
        let aux = auxMatch ? auxMatch[1].trim().replace(/<[^>]+>/g, '') : '';
        
        name = decodeHTML(name);
        aux = decodeHTML(aux);
        
        items.push({ name, aux });
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
