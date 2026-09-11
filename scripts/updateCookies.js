const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.555Z",
        "lastAccessed": "2026-09-11T22:21:31.555Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.555Z",
        "lastAccessed": "2026-09-11T22:21:31.555Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.555Z",
        "lastAccessed": "2026-09-11T22:21:31.555Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.555Z",
        "lastAccessed": "2026-09-11T22:21:31.555Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.555Z",
        "lastAccessed": "2026-09-11T22:21:31.555Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.555Z",
        "lastAccessed": "2026-09-11T22:21:31.555Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.556Z",
        "lastAccessed": "2026-09-11T22:21:31.556Z"
    },
    {
        "key": "fr",
        "value": "0OL7whAQTFZHPqmfc.AWeH8BqEusHCEFeJKYaXSZ2qqEqDh8j4dfBIbky9R3UbXvYbuBk.BqpH7H..AAA.0.0.BqpH7H.AWe0s1LXrBLaB9C0269kX5H_F4Y",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.556Z",
        "lastAccessed": "2026-09-11T22:21:31.556Z"
    },
    {
        "key": "xs",
        "value": "50%3Aw4v1beB9c3tHRQ%3A2%3A1789165253%3A-1%3A-1%3A%3AAcxoVrzlGxL0bTce2B-kKIbI6epu1SDEfEcCbVoUWA",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.556Z",
        "lastAccessed": "2026-09-11T22:21:31.556Z"
    },
    {
        "key": "presence",
        "value": "C%7B%22lm3%22%3A%22g.1635331511498568%22%2C%22t3%22%3A%5B%7B%22o%22%3A0%2C%22i%22%3A%22g.1431257902247391%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.2289937458418630%22%7D%5D%2C%22utc3%22%3A1789165277849%2C%22v%22%3A1%7D",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.556Z",
        "lastAccessed": "2026-09-11T22:21:31.556Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-11T22:21:31.556Z",
        "lastAccessed": "2026-09-11T22:21:31.556Z"
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
