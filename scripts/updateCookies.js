const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    {
        "key": "dbln",
        "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D",
        "domain": "facebook.com",
        "path": "/login/device-based/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.570Z",
        "lastAccessed": "2026-09-12T07:48:40.570Z"
    },
    {
        "key": "sb",
        "value": "oZ-mZmUkSi-ORxWZSYx0LUyc",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.570Z",
        "lastAccessed": "2026-09-12T07:48:40.570Z"
    },
    {
        "key": "datr",
        "value": "vWo9aRvRclEH-d95BN9Q5ptx",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.570Z",
        "lastAccessed": "2026-09-12T07:48:40.570Z"
    },
    {
        "key": "ps_l",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.570Z",
        "lastAccessed": "2026-09-12T07:48:40.570Z"
    },
    {
        "key": "ps_n",
        "value": "1",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.570Z",
        "lastAccessed": "2026-09-12T07:48:40.570Z"
    },
    {
        "key": "dpr",
        "value": "0.8999999761581421",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.570Z",
        "lastAccessed": "2026-09-12T07:48:40.570Z"
    },
    {
        "key": "wd",
        "value": "1517x712",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.570Z",
        "lastAccessed": "2026-09-12T07:48:40.570Z"
    },
    {
        "key": "c_user",
        "value": "61560227271099",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.570Z",
        "lastAccessed": "2026-09-12T07:48:40.570Z"
    },
    {
        "key": "fr",
        "value": "03cwCc3HgHtCCbYK9.AWd__o3P4q30mb68yGT3RIEn05JyDYaiMmAql7KyIR2AjJpuXEI.BqpQPK..AAA.0.0.BqpQPK.AWcBlC9Hr36jl9A1nSnA6hitw8g",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.571Z",
        "lastAccessed": "2026-09-12T07:48:40.571Z"
    },
    {
        "key": "xs",
        "value": "6%3AShaNwiN2tVstww%3A2%3A1789199304%3A-1%3A-1%3A%3AAcxBYQALRRGy29zVIZD5_DPeLdXbrARFmgJfd6gZjQ",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.571Z",
        "lastAccessed": "2026-09-12T07:48:40.571Z"
    },
    {
        "key": "presence",
        "value": "C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1789199313148%2C%22v%22%3A1%7D",
        "domain": "facebook.com",
        "path": "/",
        "hostOnly": false,
        "creation": "2026-09-12T07:48:40.571Z",
        "lastAccessed": "2026-09-12T07:48:40.571Z"
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
