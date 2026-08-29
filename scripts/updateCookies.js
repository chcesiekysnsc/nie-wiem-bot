const fs = require('fs');
const path = require('path');

const NEW_COOKIES = [
    { "key": "dbln", "value": "%7B%2261562475523609%22%3A%22AX6WwYPo%22%7D", "domain": "facebook.com", "path": "/login/device-based/", "hostOnly": false, "creation": "2026-08-29T14:49:45.229Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "sb", "value": "oZ-mZmUkSi-ORxWZSYx0LUyc", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "oo", "value": "v1", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "datr", "value": "vWo9aRvRclEH-d95BN9Q5ptx", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "ps_l", "value": "1", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "ps_n", "value": "1", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "dpr", "value": "0.8999999761581421", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "c_user", "value": "61560227271099", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "xs", "value": "9%3AfaJzWehoc5RCJQ%3A2%3A1788013411%3A-1%3A-1%3A%3AAczhO-xPGy9n3_aT1SlLl7QcH1BgfIi51KffjARfYg", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "wd", "value": "1517x712", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" },
    { "key": "presence", "value": "C%7B%22lm3%22%3A%22g.9795377237153946%22%2C%22t3%22%3A%5B%7B%22o%22%3A0%2C%22i%22%3A%22sg.1100013892482010%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.1941475763923065%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.1670734170899923%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.4250424458562247%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.1525355155178009%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.6698206640293948%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.1635331511498568%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.975878548807817%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.1600757498336335%22%7D%2C%7B%22o%22%3A0%2C%22i%22%3A%22g.1518472579365208%22%7D%5D%2C%22utc3%22%3A1788014984271%2C%22v%22%3A1%7D", "domain": "facebook.com", "path": "/", "hostOnly": false, "creation": "2026-08-29T14:49:45.231Z", "lastAccessed": "2026-08-29T14:49:45.231Z" }
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
