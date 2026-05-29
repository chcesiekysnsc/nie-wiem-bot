const https = require('https');

const username = 'rj';
const url = `https://www.last.fm/user/${username}/partial/albums?albums_date_preset=LAST_30_DAYS`;

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
};

https.get(url, options, (res) => {
  console.log('Status code:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Data length:', data.length);
    console.log('Data preview (first 1000):', data.slice(0, 1000));
    console.log('Contains chartlist-row:', data.includes('chartlist-row'));
    console.log('Contains grid-items:', data.includes('grid-items'));
  });
});
