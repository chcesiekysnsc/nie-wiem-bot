const https = require('https');

function checkUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(res.statusCode);
    }).on('error', () => {
      resolve(500);
    });
  });
}

async function run() {
  const thumbSrc = "https://scontent-waw2-2.xx.fbcdn.net/v/t39.30808-1/636792460_122212662626340909_6760720803906035075_n.jpg?stp=cp0_dst-jpg_s60x60_tt6&_nc_cat=105&ccb=1-7&_nc_sid=e99d92&_nc_ohc=FWdvT4ZQqXMQ7kNvwEUbeBV&_nc_oc=AdoEaPDGuzl9AlDGXIcwDL5XMBj2IXcV8J7Z2IeYI16L0Mx-CHFEkXfBTwTAdGd3omU&_nc_zt=24&_nc_ht=scontent-waw2-2.xx&_nc_gid=_KnkQd3dq3yRmlSPAn3kmQ&_nc_ss=702a8&oh=00_Af5DstKUM_ZwwBppMTETY9GYd4bOqjQkLz9K2YbF8yhMYQ&oe=6A1524AF";

  console.log('Original status:', await checkUrl(thumbSrc));

  // Variant 1: Remove stp parameter entirely
  const v1 = thumbSrc.replace(/stp=[^&]+&?/, '');
  console.log('Remove stp status:', await checkUrl(v1));

  // Variant 2: Replace s60x60 with s100x100
  const v2 = thumbSrc.replace('s60x60', 's100x100');
  console.log('s100x100 status:', await checkUrl(v2));

  // Variant 3: Replace s60x60 with s320x320
  const v3 = thumbSrc.replace('s60x60', 's320x320');
  console.log('s320x320 status:', await checkUrl(v3));

  // Variant 4: Try to fetch using graph.facebook.com with type=square
  const v4 = "https://graph.facebook.com/61560227271099/picture?type=square";
  console.log('Graph type=square status:', await checkUrl(v4));
}

run();
