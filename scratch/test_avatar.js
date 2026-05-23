const https = require('https');
const fs = require('fs');
const path = require('path');

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    function get(url) {
      https.get(url, (response) => {
        console.log(`STATUS: ${response.statusCode}, LOCATION: ${response.headers.location}`);
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return get(response.headers.location);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
        file.on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }
    get(url);
  });
}

async function run() {
  const targetId = '61560227271099'; // User's ID from cookies
  const url = `https://graph.facebook.com/${targetId}/picture?width=500&height=500`;
  const dest = path.join(__dirname, 'test_avatar.jpg');
  console.log(`Downloading avatar from: ${url}`);
  try {
    await downloadImage(url, dest);
    console.log(`File downloaded! Size: ${fs.statSync(dest).size} bytes`);
    fs.unlinkSync(dest);
  } catch (err) {
    console.error('Download failed:', err);
  }
}

run();
