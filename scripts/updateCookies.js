const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "fr",
        "value": "0wv6qlWD9yUJxQ30m.AWd3HsA3wiIRH521mlCQ8HJATB7_HLhMwn1tfYnqU3W2icqRfgs.BqndKN..AAA.0.0.BqndKN.AWcDyvBlVcOFmUBUaLQTdu7qW4U",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "xs",
        "value": "36%3A75cjlvvwdZEJoA%3A2%3A1788727948%3A-1%3A-1%3A%3AAczx94P4QxKOMzhjcQcKXcrabKsNwibpoOiW8ttyLw",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    },
    {
        "key": "presence",
        "value": "C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1788727953401%2C%22v%22%3A1%7D",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-06T20:52:33.945Z",
        "lastAccessed": "2026-09-06T20:52:33.945Z"
    }
];

const SEED_APPSTATE = path.join(__dirname, '..', 'data_seed', 'appstate.json');
const DATA_APPSTATE = path.join(__dirname, '..', 'data', 'appstate.json');
const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';

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

    const jsonStr = JSON.stringify(data, null, 2);

    fs.writeFileSync(SEED_APPSTATE, jsonStr, 'utf8');
    console.log('[COOKIES] Zaktualizowano data_seed/appstate.json');

    try {
        const dataDir = path.dirname(DATA_APPSTATE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(DATA_APPSTATE, jsonStr, 'utf8');
        console.log('[COOKIES] Zaktualizowano data/appstate.json');
    } catch (e) {
        console.error('Błąd zapisu data/appstate.json:', e.message);
    }

    if (fs.existsSync(BACKUP_DIR)) {
        try {
            fs.writeFileSync(path.join(BACKUP_DIR, 'appstate.json'), jsonStr, 'utf8');
            console.log('[COOKIES] Zaktualizowano db_backups/appstate.json');
        } catch (e) {
            console.error('Błąd zapisu db_backups/appstate.json:', e.message);
        }
    }
}

main();
