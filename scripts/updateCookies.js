const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "oo",
        "value": "v1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "fr",
        "value": "0YmZXOkDxxIFfnUea.AWcnW8dt1qtUadbQpFeX_ztqSWrfr-O5puPpmJnxh0F03LAIak0.BqmFmC..AAA.0.0.BqmFmC.AWcVrfaZgoXv8FE7JBwwu5GgoDc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.085Z",
        "lastAccessed": "2026-09-02T17:14:49.085Z"
    },
    {
        "key": "xs",
        "value": "44%3AtzCybFCnDjVVsQ%3A2%3A1788369280%3A-1%3A-1%3A%3AAcy0SrNQHz9SaRW1Jim_KkoHcl7zTHw3lToJPK0Nig",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.086Z",
        "lastAccessed": "2026-09-02T17:14:49.086Z"
    },
    {
        "key": "presence",
        "value": "C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1788369288714%2C%22v%22%3A1%7D",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-02T17:14:49.086Z",
        "lastAccessed": "2026-09-02T17:14:49.086Z"
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
