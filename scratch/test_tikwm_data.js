const axios = require('axios');

async function dumpData() {
  const videoUrl = 'https://vm.tiktok.com/ZMYx7Y2wA/';
  const params = new URLSearchParams();
  params.append('url', videoUrl);
  params.append('hd', '0');

  const res = await axios.post('https://www.tikwm.com/api/', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  console.log(JSON.stringify(res.data.data, null, 2));
}

dumpData().catch(console.error);
