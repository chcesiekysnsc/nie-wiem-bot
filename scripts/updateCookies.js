const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.282Z",
        "lastAccessed": "2026-09-07T16:13:49.282Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "fr",
        "value": "0PzAO9cHq1aEDbFid.AWetU5hMQ6nBYg0QGG_xJyGfL1N0lqzwlyY56uWT6axf58XZrdo.BqnuK1..AAA.0.0.BqnuK1.AWe3IpEwRKRawVErlbAQQE0_M2U",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "xs",
        "value": "10%3AC_MjhXsKtyAiqA%3A2%3A1788797619%3A-1%3A-1%3A%3AAcyw7XEb6ugNsRGcwkmrQqnqVqrsBrtKjGUY2ycyrw",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    },
    {
        "key": "presence",
        "value": "C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1788797625565%2C%22v%22%3A1%7D",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-07T16:13:49.283Z",
        "lastAccessed": "2026-09-07T16:13:49.283Z"
    }
];

const ROOT_APPSTATE = path.join(__dirname, '..', 'appstate.json');
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

    // 1. Root appstate.json
    fs.writeFileSync(ROOT_APPSTATE, jsonStr, 'utf8');
    console.log('[COOKIES] Zaktualizowano appstate.json');

    // 2. data_seed/appstate.json
    fs.writeFileSync(SEED_APPSTATE, jsonStr, 'utf8');
    console.log('[COOKIES] Zaktualizowano data_seed/appstate.json');

    // 3. data/appstate.json
    try {
        const dataDir = path.dirname(DATA_APPSTATE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(DATA_APPSTATE, jsonStr, 'utf8');
        console.log('[COOKIES] Zaktualizowano data/appstate.json');
    } catch (e) {
        console.error('Błąd zapisu data/appstate.json:', e.message);
    }

    // 4. db_backups/appstate.json
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
