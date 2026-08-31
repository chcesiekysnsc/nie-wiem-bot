const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.868Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "oo",
        "value": "v1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "fr",
        "value": "0JZiGKq4QREOE1zYf.AWeg8mZKJix2lhbDi1AzHg-pTz438u2FxymlR6mysz1muj3s3F0.BqlThz..AAA.0.0.BqlThz.AWfo1mxoswGGBxHtz35te-TCIuk",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "xs",
        "value": "7%3A3QcIQej3y2cvDg%3A2%3A1788164209%3A-1%3A-1%3A%3AAcwdIGPXleSrxsVPGeSfvlODrzXj-wm3b2VS2pSCtw",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    },
    {
        "key": "presence",
        "value": "C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1788164246849%2C%22v%22%3A1%7D",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-31T08:17:28.869Z",
        "lastAccessed": "2026-08-31T08:17:28.869Z"
    }
];

const DATA_APPSTATE = path.join(__dirname, '..', 'data', 'appstate.json');
const SEED_APPSTATE = path.join(__dirname, '..', 'data_seed', 'appstate.json');

function mergeCookies(existing, updates) {
    const map = new Map(existing.map(c => [c.key, { ...c }]));
    for (const u of updates) {
        const existingEntry = map.get(u.key);
        if (existingEntry) {
            existingEntry.value = u.value;
            existingEntry.creation = u.creation;
            existingEntry.lastAccessed = u.lastAccessed;
        } else {
            map.set(u.key, { ...u });
        }
    }
    return Array.from(map.values());
}

function main() {
    let data = [];
    try {
        data = JSON.parse(fs.readFileSync(DATA_APPSTATE, 'utf8'));
    } catch (_) {}
    data = mergeCookies(data, NEW_COOKIES);
    fs.writeFileSync(DATA_APPSTATE, JSON.stringify(data, null, 2), 'utf8');
    console.log('[COOKIES] Zaktualizowano data/appstate.json');

    fs.copyFileSync(DATA_APPSTATE, SEED_APPSTATE);
    console.log('[COOKIES] Skopiowano do data_seed/appstate.json');
}

main();
