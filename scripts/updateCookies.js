const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.038Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "oo",
        "value": "v1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "xs",
        "value": "21%3Ai8Gu4RD94PNbvw%3A2%3A1788291758%3A-1%3A-1%3A%3AAczV8-M5tnYchbdS03P3_ghhVCAOCwgUGLKugt9cag",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "fr",
        "value": "05JK2GgZ3dkpggnRk.AWc4LrB2Rp_MEAgWHX2eqgWZORE3Am2QyR_FmH0vsTcBIcQv51s.Bqlyq1..AAA.0.0.Bqlyq1.AWdTI2E9VgX7lLqi2LFZOiv4A_s",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    },
    {
        "key": "presence",
        "value": "C%7B%22lm3%22%3A%22g.1635331511498568%22%2C%22t3%22%3A%5B%5D%2C%22utc3%22%3A1788291774278%2C%22v%22%3A1%7D",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T19:42:55.039Z",
        "lastAccessed": "2026-09-01T19:42:55.039Z"
    }
];

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
        data = JSON.parse(fs.readFileSync(SEED_APPSTATE, 'utf8'));
    } catch (_) {}
    data = mergeCookies(data, NEW_COOKIES);
    fs.writeFileSync(SEED_APPSTATE, JSON.stringify(data, null, 2), 'utf8');
    console.log('[COOKIES] Zaktualizowano data_seed/appstate.json');
}

main();
