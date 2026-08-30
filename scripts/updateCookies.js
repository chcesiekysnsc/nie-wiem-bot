const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.415Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "oo",
        "value": "v1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "fr",
        "value": "0V0wj56wifE8heb6A.AWdZZ3kc3jHLhw4y8PQuaVv_CGUngcpcBdm8S2QdA6uqaogT0v0.BqlBSd..AAA.0.0.BqlBSd.AWcv0hK5Dbv70pXqm6NOTdYDwfg",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "xs",
        "value": "33%3AGwgtvtGlx_8RGQ%3A2%3A1788089500%3A-1%3A-1%3A%3AAcwd5dIIBwLc_buMImxwSfLbS6Cl5a6QIgWPGYnbLQ",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
    },
    {
        "key": "presence",
        "value": "C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1788089506991%2C%22v%22%3A1%7D",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-08-30T11:31:47.417Z",
        "lastAccessed": "2026-08-30T11:31:47.417Z"
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
