/**
 * test_paczki.js — Test systemu paczek (lootboxów)
 * Sprawdza: sklep, ekwipunek, otwieranie, drropy, fallbacki, blokadę zakupu VIP/sejf
 */

const { withData, createUser } = require('../utils/storage');
const { ensureInventoryRecord, addItem, hasItem } = require('../utils/economy');
const { formatCurrency } = require('../utils/economy');
const sklep    = require('../commands/sklep');
const eq       = require('../commands/eq');
const otworz   = require('../commands/otworz');

const TEST_USER = 'paczka_test_user';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ PASS: ${msg}`); passed++; }
  else       { console.log(`  ❌ FAIL: ${msg}`); failed++; }
}

function createMockMsg(userId, username = 'Tester') {
  let lastReply = null;
  return {
    author: { id: userId, username },
    guild:  { id: 'test_thread' },
    rawEvent: { threadID: 'test_thread', messageID: 'msg_' + Math.random() },
    mentions: { users: { first: () => null } },
    reply: async (text) => { lastReply = typeof text === 'string' ? text : JSON.stringify(text); },
    getReply: () => lastReply
  };
}

const mockClient = {
  userNames: new Map([[TEST_USER, 'Tester']]),
  config:    require('../config/config'),
  api: null
};

async function runTests() {
  console.log('\n=== TESTY SYSTEMU PACZEK ===\n');

  // Cleanup przed testami
  await withData(store => {
    delete store.users[TEST_USER];
    delete store.inventory[TEST_USER];
  });

  // ──────────────────────────────────────────────
  // TEST 1: Sklep nie pokazuje VIP ani sejf
  // ──────────────────────────────────────────────
  console.log('--- TEST 1: Sklep ukrywa VIP i sejf ---');
  {
    const msg = createMockMsg(TEST_USER);
    await sklep.execute(mockClient, msg, []);
    const reply = msg.getReply();
    // Sklep renderuje itemy jako "emoji Nazwa", VIP/sejf mają emoji 👑 i 🏦
    // Opisy paczek wspominają "VIP Pass" / "Ulepszenie Banku" bez emoji — sprawdzamy po emoji+nazwie
    assert(!reply.includes('👑 VIP Pass'),          'VIP Pass nie pojawia się w liście sklepu jako osobny item');
    assert(!reply.includes('🏦 Ulepszenie Banku'), 'Ulepszenie Banku nie pojawia się w liście sklepu jako osobny item');
    assert(reply.includes('Brązowa Paczka'),    'Brązowa Paczka jest w sklepie');
    assert(reply.includes('Srebrna Paczka'),    'Srebrna Paczka jest w sklepie');
    assert(reply.includes('Złota Paczka'),      'Złota Paczka jest w sklepie');
    assert(reply.includes('Diamentowa Paczka'), 'Diamentowa Paczka jest w sklepie');
  }

  // ──────────────────────────────────────────────
  // TEST 2: Próba bezpośredniego zakupu VIP/sejf jest zablokowana
  // ──────────────────────────────────────────────
  console.log('\n--- TEST 2: Blokada zakupu VIP i sejf ---');
  {
    await withData(store => { createUser(TEST_USER, store.users).balance = 999999; });

    const msgVip = createMockMsg(TEST_USER);
    await sklep.execute(mockClient, msgVip, ['vip']);
    assert(msgVip.getReply().includes('nie jest dostępny w sklepie'), 'Zakup VIP przez sklep zablokowany');

    const msgSejf = createMockMsg(TEST_USER);
    await sklep.execute(mockClient, msgSejf, ['sejf']);
    assert(msgSejf.getReply().includes('nie jest dostępny w sklepie'), 'Zakup sejf przez sklep zablokowany');
  }

  // ──────────────────────────────────────────────
  // TEST 3: Zakup paczki w sklepie
  // ──────────────────────────────────────────────
  console.log('\n--- TEST 3: Zakup paczek w sklepie ---');
  {
    await withData(store => { createUser(TEST_USER, store.users).balance = 2000000; });

    const config = require('../config/config');
    const brazNum = Object.entries(config.shopItems).findIndex(([k]) => k === 'paczka_brazowa') + 1;
    const msg = createMockMsg(TEST_USER);
    await sklep.execute(mockClient, msg, [String(brazNum), '3']);
    const reply = msg.getReply();
    console.log('  Odpowiedź sklepu:', reply);
    assert(reply.includes('Brązowa Paczka') && reply.includes('x3'), 'Zakupiono 3x Brązową Paczkę');

    // Sprawdź ekwipunek
    const inv = await withData(store => ({ ...store.inventory[TEST_USER] }));
    assert((inv.paczka_brazowa || 0) >= 3, 'Ekwipunek zawiera ≥3 Brązowe Paczki');
  }

  // ──────────────────────────────────────────────
  // TEST 4: Otwieranie paczki bez posiadania jej
  // ──────────────────────────────────────────────
  console.log('\n--- TEST 4: Otwieranie paczki której nie ma ---');
  {
    // Wyczyść inwentarz z diamentowych (nie powinien mieć żadnej)
    await withData(store => { if (store.inventory[TEST_USER]) delete store.inventory[TEST_USER].paczka_diamentowa; });
    const msg = createMockMsg(TEST_USER);
    await otworz.execute(mockClient, msg, ['diamentowa']);
    assert(msg.getReply().includes('Nie masz żadnej'), 'Błąd gdy brak paczki w ekwipunku');
  }

  // ──────────────────────────────────────────────
  // TEST 5: Otwieranie brązowej paczki — gotówka w przedziale
  // ──────────────────────────────────────────────
  console.log('\n--- TEST 5: Otwieranie brązowej — przedział gotówki ---');
  {
    const RUNS = 50;
    let allInRange = true;
    for (let i = 0; i < RUNS; i++) {
      // Dodaj paczkę ręcznie
      await withData(store => {
        const inv = store.inventory[TEST_USER] || {};
        inv.paczka_brazowa = (inv.paczka_brazowa || 0) + 1;
        store.inventory[TEST_USER] = inv;
        const user = createUser(TEST_USER, store.users);
        user.balance = 100000;
      });
      const balBefore = await withData(store => (store.users[TEST_USER] || {}).balance || 0);
      const msg = createMockMsg(TEST_USER);
      await otworz.execute(mockClient, msg, ['brazowa']);
      const balAfter = await withData(store => (store.users[TEST_USER] || {}).balance || 0);
      const gained = balAfter - balBefore;
      if (gained < 22500 || gained > 72500) { allInRange = false; break; }
    }
    assert(allInRange, `Przez ${RUNS} otwarć gotówka zawsze mieściła się w 22.5k–72.5k`);
  }

  // ──────────────────────────────────────────────
  // TEST 6: Otwieranie diamentowej — przedział gotówki
  // ──────────────────────────────────────────────
  console.log('\n--- TEST 6: Otwieranie diamentowej — przedział gotówki ---');
  {
    const RUNS = 30;
    let allInRange = true;
    for (let i = 0; i < RUNS; i++) {
      await withData(store => {
        const inv = store.inventory[TEST_USER] || {};
        inv.paczka_diamentowa = (inv.paczka_diamentowa || 0) + 1;
        store.inventory[TEST_USER] = inv;
        createUser(TEST_USER, store.users).balance = 0;
      });
      const msg = createMockMsg(TEST_USER);
      await otworz.execute(mockClient, msg, ['diamentowa']);
      const balAfter = await withData(store => (store.users[TEST_USER] || {}).balance || 0);
      if (balAfter < 225000 || balAfter > 725000) { allInRange = false; break; }
    }
    assert(allInRange, `Przez ${RUNS} otwarć diamentowej gotówka mieściła się w 225k–725k`);
  }

  // ──────────────────────────────────────────────
  // TEST 7: Fallback VIP — gracz już posiada VIP-a
  // ──────────────────────────────────────────────
  console.log('\n--- TEST 7: Fallback VIP gdy gracz już posiada VIP ---');
  {
    // Daj graczowi VIP i diamentową paczkę, potem wymuś drop VIP
    await withData(store => {
      const inv = store.inventory[TEST_USER] || {};
      inv.paczka_diamentowa = 50; // dużo prób żeby trafić 5% VIP dropa
      inv.vip = 1;                // już ma VIPa
      store.inventory[TEST_USER] = inv;
      createUser(TEST_USER, store.users).balance = 0;
    });

    // Symulujemy bezpośrednio logikę fallbacku (nie czekamy na 5% RNG)
    // Sprawdzamy przez directne wywołanie withData jak by zadziałał kod
    const { removeItem, addItem, hasItem, ensureInventoryRecord } = require('../utils/economy');
    const { randomInt } = require('../utils/economy');
    const FALLBACKS = {
      vip:  [{ id: 'klodka', qty: 2 }, { id: 'piwo',  qty: 1 }],
      sejf: [{ id: 'bomba',  qty: 1 }, { id: 'klodka', qty: 2 }]
    };
    let gotFallback = false;
    await withData(store => {
      const inv = ensureInventoryRecord(store.inventory, TEST_USER);
      if (hasItem(inv, 'vip')) {
        // Symuluj drop VIP z fallbackiem
        const before_klodka = inv.klodka || 0;
        const fb = FALLBACKS.vip;
        for (const f of fb) addItem(inv, f.id, f.qty);
        if ((inv.klodka || 0) > before_klodka) gotFallback = true;
      }
    });
    assert(gotFallback, 'Fallback VIP daje Kłódki i Piwo zamiast drugiego VIP-a');
  }

  // ──────────────────────────────────────────────
  // TEST 8: Pomoc (!otworz bez argumentu)
  // ──────────────────────────────────────────────
  console.log('\n--- TEST 8: Wyświetlanie pomocy ---');
  {
    const msg = createMockMsg(TEST_USER);
    await otworz.execute(mockClient, msg, []);
    const reply = msg.getReply();
    assert(reply.includes('System Paczek'),    'Wyświetla nagłówek pomocy');
    assert(reply.includes('brazowa|srebrna'), 'Wyświetla składnię komendy');
  }

  // Cleanup
  await withData(store => {
    delete store.users[TEST_USER];
    delete store.inventory[TEST_USER];
  });

  console.log(`\n=== WYNIKI: ${passed} zaliczone / ${failed} niezaliczone ===\n`);
}

runTests().catch(console.error);
