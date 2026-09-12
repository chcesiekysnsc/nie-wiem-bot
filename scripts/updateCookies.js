const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "fr",
        "value": "0I91jRMODldpnlssM.AWdYbx7oA1oeYSxZIgqdgI7pjtGQvaRb5lNvj8w20_B8eiC8PhQ.BqpS2T..AAA.0.0.BqpS2T.AWd6wZeTiQNzX8O3MkJ4CnkOd2I",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
    },
    {
        "key": "xs",
        "value": "45%3ASNh6yigrXL6nPg%3A2%3A1789210000%3A-1%3A-1%3A%3AAcx1lqQre9tpdQX4NCBsX8RtIYY7KuzJaoIc8gIcVw",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T10:46:46.955Z",
        "lastAccessed": "2026-09-12T10:46:46.955Z"
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
