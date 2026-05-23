const https = require('https');
const fs = require('fs');
const path = require('path');

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
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
  });
}

async function run() {
  const thumbSrc = "https://scontent-waw2-2.xx.fbcdn.net/v/t39.30808-1/636792460_122212662626340909_6760720803906035075_n.jpg?stp=cp0_dst-jpg_s60x60_tt6&_nc_cat=105&ccb=1-7&_nc_sid=e99d92&_nc_ohc=FWdvT4ZQqXMQ7kNvwEUbeBV&_nc_oc=AdoEaPDGuzl9AlDGXIcwDL5XMBj2IXcV8J7Z2IeYI16L0Mx-CHFEkXfBTwTAdGd3omU&_nc_zt=24&_nc_ht=scontent-waw2-2.xx&_nc_gid=_KnkQd3dq3yRmlSPAn3kmQ&_nc_ss=702a8&oh=00_Af5DstKUM_ZwwBppMTETY9GYd4bOqjQkLz9K2YbF8yhMYQ&oe=6A1524AF";
  
  const targetUrl = thumbSrc.replace(/s\d+x\d+/, 's480x480');
  const dest = path.join(__dirname, 'test_avatar_scaled.jpg');
  console.log(`Downloading scaled avatar from: ${targetUrl}`);
  try {
    await downloadImage(targetUrl, dest);
    console.log(`File downloaded! Size: ${fs.statSync(dest).size} bytes`);
    fs.unlinkSync(dest);
  } catch (err) {
    console.error('Download failed:', err);
  }
}

run();
