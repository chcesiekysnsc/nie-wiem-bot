const fs = require('fs');
const https = require('https');
const path = require('path');

const HARDCODED_APP_STATE = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "oo",
        "value": "v1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "wd",
        "value": "1366x641",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "fr",
        "value": "0BevccuVfmrxmg3DJ.AWc2Tbwm4ChaQNzojgS1rwIo4vEA2-ABA82sRpm1fXIWWTIb3oY.BqTOmg..AAA.0.0.BqTOmg.AWfvsujIfdrB3P1lQR6gx0ENMYs",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    },
    {
        "key": "xs",
        "value": "28%3A30rSYwQ6Sk3D2A%3A2%3A1783425438%3A-1%3A-1%3A%3AAczTzC2LIVa9-dcNZbGrD7Yqiip6TIeouKJbkyMnFQ",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-07-07T11:57:25.946Z",
        "lastAccessed": "2026-07-07T11:57:25.946Z"
    }
];

function getCookieString() {
  try {
    const appState = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'appstate.json'), 'utf8'));
    return appState.map(c => `${c.key}=${c.value}`).join('; ');
  } catch (err) {
    console.error('[FB-UTILS] Error reading appstate.json, using hardcoded fallback:', err.message);
    return HARDCODED_APP_STATE.map(c => `${c.key}=${c.value}`).join('; ');
  }
}

function parseFBInput(input) {
  input = input.trim();
  
  if (/^\d+$/.test(input)) {
    return { type: 'id', value: input };
  }
  
  try {
    let urlString = input;
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = 'https://' + urlString;
    }
    const parsedUrl = new URL(urlString);
    
    if (/(?:^|\.)facebook\.com$/i.test(parsedUrl.hostname)) {
      if (parsedUrl.pathname === '/profile.php') {
        const id = parsedUrl.searchParams.get('id');
        if (id && /^\d+$/.test(id)) {
          return { type: 'id', value: id };
        }
      }
      
      const pathParts = parsedUrl.pathname.split('/').filter(p => p.length > 0);
      if (pathParts.length > 0) {
        const username = pathParts[0];
        const nonUsernames = ['groups', 'pages', 'events', 'messages', 'notifications', 'settings', 'friends', 'marketplace'];
        if (!nonUsernames.includes(username.toLowerCase())) {
          return { type: 'username', value: username };
        }
      }
    }
  } catch (err) {
    // Ignore URL parsing errors
  }
  
  return { type: 'username', value: input };
}

function resolveUIDFromUsername(username, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    const cookieStr = getCookieString();
    const url = `https://www.facebook.com/${username}`;
    
    function makeRequest(targetUrl, redirectsRemaining) {
      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch (err) {
        return reject(new Error(`Nieprawidłowy URL przekierowania: ${targetUrl}`));
      }
      
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'Cookie': cookieStr,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1'
        }
      };

      https.get(options, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            if (redirectUrl.includes('login.php') || redirectUrl.includes('/login/')) {
              return reject(new Error('Facebook przekierował do strony logowania. Prawdopodobnie sesja (appstate.json) wygasła.'));
            }
            if (redirectsRemaining > 0) {
              const resolvedUrl = redirectUrl.startsWith('http') 
                ? redirectUrl 
                : `https://${parsed.hostname}${redirectUrl}`;
              return makeRequest(resolvedUrl, redirectsRemaining - 1);
            } else {
              return reject(new Error('Zbyt wiele przekierowań na Facebooku podczas ustalania ID.'));
            }
          }
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Błąd serwera Facebook (HTTP ${res.statusCode})`));
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const currentUrlParsed = new URL(targetUrl);
          if (currentUrlParsed.pathname === '/profile.php') {
            const id = currentUrlParsed.searchParams.get('id');
            if (id && /^\d+$/.test(id)) {
              return resolve(id);
            }
          }
          
          const escapedUsername = username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const vanityRegex = new RegExp(`"userVanity"\\s*:\\s*"${escapedUsername}"\\s*,\\s*"userID"\\s*:\\s*"(\\d+)"`, 'i');
          const vanityMatch = data.match(vanityRegex);
          if (vanityMatch && vanityMatch[1]) {
            return resolve(vanityMatch[1]);
          }

          const generalVanityRegex = /"userVanity"\s*:\s*"[^"]+"\s*,\s*"userID"\s*:\s*"(\d+)"/i;
          const generalMatch = data.match(generalVanityRegex);
          if (generalMatch && generalMatch[1]) {
            return resolve(generalMatch[1]);
          }

          const userIdRegex = /"userID"\s*:\s*"(\d+)"/g;
          let m;
          const matchedIds = [];
          while ((m = userIdRegex.exec(data)) !== null) {
            matchedIds.push(m[1]);
          }
          if (matchedIds.length > 0) {
            const counts = {};
            let maxId = matchedIds[0];
            let maxCount = 0;
            for (const id of matchedIds) {
              counts[id] = (counts[id] || 0) + 1;
              if (counts[id] > maxCount) {
                maxCount = counts[id];
                maxId = id;
              }
            }
            return resolve(maxId);
          }

          const entityIdMatch = data.match(/"entity_id"\s*:\s*"(\d+)"/i) || 
                              data.match(/"pageID"\s*:\s*"(\d+)"/i) ||
                              data.match(/"delegate_page"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/i);
          if (entityIdMatch && entityIdMatch[1]) {
            return resolve(entityIdMatch[1]);
          }

          return reject(new Error('Nie znaleziono identyfikatora ID użytkownika w kodzie źródłowym profilu.'));
        });
      }).on('error', reject);
    }

    makeRequest(url, maxRedirects);
  });
}

module.exports = {
  getCookieString,
  parseFBInput,
  resolveUIDFromUsername
};
