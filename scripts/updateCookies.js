const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.474Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "oo",
        "value": "v1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "fr",
        "value": "0Jif7m6tWeXiag6OA.AWc0ogBKibRnKeqwr866O-51aIJWKSezuVDu36rllG4ZiKZYHN0.Bqlwtm..AAA.0.0.Bqlwtm.AWeo1vZfEHsZlGt7_uXExME3OfI",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
    },
    {
        "key": "xs",
        "value": "13%3ADQH95MiJQ_uUeA%3A2%3A1788283749%3A-1%3A-1%3A%3AAczEJs7Ci-IsCwsEL4SUF3uyAmmD8gGM4_99VapgiA",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-01T17:29:16.475Z",
        "lastAccessed": "2026-09-01T17:29:16.475Z"
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
