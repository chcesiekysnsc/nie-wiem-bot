const fs = require('fs');
const path = require('path');

const data = fs.readFileSync(path.join(__dirname, 'lastfm_top_artists.html'), 'utf8'); // Wait, let's read lastfm_profile.html split by top-albums, or let's read the debug_partial_albums html!
// Let's create an empty file, wait, we don't have the debug_partial_albums html saved.
// Let's write a script that fetches the albums partial and parses it using our unified parser.
const https = require('https');

const username = 'rj';
const url = `https://www.last.fm/user/${username}/partial/albums?albums_date_preset=LAST_30_DAYS`;

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
};

https.get(url, options, (res) => {
  let html = '';
  res.on('data', (chunk) => {
    html += chunk;
  });
  
  res.on('end', () => {
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
    
    function parseLastFMHTML(data) {
      const items = [];
      
      if (data.includes('chartlist-row')) {
        const rows = data.split(/<tr[^>]*class="[^"]*chartlist-row/i);
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const nameMatch = row.match(/class="chartlist-name"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                            row.match(/class="chartlist-artist"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
          const countMatch = row.match(/class="chartlist-count-bar-value"[^>]*>([\s\S]*?)<\/span>/i) ||
                             row.match(/class="chartlist-count-bar-link"[^>]*>([\s\S]*?)<\/a>/i);
          const artistMatch = row.match(/class="chartlist-artist"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
          const youtubeMatch = row.match(/data-youtube-url="([^"]+)"/i) ||
                               row.match(/href="(https:\/\/www\.youtube\.com\/watch\?[^"]+)"/i);
          const youtubeUrl = youtubeMatch ? youtubeMatch[1] : null;
          const isNowPlaying = row.includes('chartlist-row--now-scrobbling') ||
                               row.includes('js-now-playing-text') ||
                               row.includes('now-scrobbling');

          if (nameMatch) {
            let name = nameMatch[1].trim().replace(/<[^>]+>/g, '');
            let count = countMatch ? countMatch[1].trim().replace(/<[^>]+>/g, '') : '';
            let artist = artistMatch ? artistMatch[1].trim().replace(/<[^>]+>/g, '') : '';
            
            name = decodeHTML(name);
            artist = decodeHTML(artist);
            count = decodeHTML(count);
            
            items.push({ name, artist, count, youtubeUrl, nowPlaying: isNowPlaying });
          }
        }
      } else {
        const gridRegex = /<li[^>]*class="[^"]*grid-items-item[\s\S]*?<\/li>/gi;
        let m;
        while ((m = gridRegex.exec(data)) !== null) {
          const block = m[0];
          const nameMatch = block.match(/class="grid-items-item-main-text"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
          const auxSectionMatch = block.match(/class="grid-items-item-aux-text"([\s\S]*?)<\/p>/i) ||
                                  block.match(/class="grid-items-item-aux-text"([\s\S]*?)<\/div>/i);
          let artist = '';
          let count = '';
          
          if (auxSectionMatch) {
            const auxContent = auxSectionMatch[1];
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
    
    console.log('Parsed Top Albums (30 days):', parseLastFMHTML(html));
  });
});
