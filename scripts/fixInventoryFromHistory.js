const fs = require('fs');
const path = require('path');

const HISTORY_FILE = 'C:\\Users\\dupek\\Downloads\\file-1788729864683';
const DATA_DIR = path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data_seed');
const BACKUP_DIR = 'C:\\Users\\dupek\\.gemini\\antigravity\\db_backups';

function saveJson(p, data) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[ZAPISANO] ${p} (${fs.statSync(p).size.toLocaleString()} B)`);
}

function main() {
  console.log('[FIX-EQ] Wczytuję plik historii:', HISTORY_FILE);
  const msgs = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  msgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  console.log(`[FIX-EQ] ${msgs.length} wiadomości.`);

  // === KROK 1: Zbuduj mapę nazwa → ID ===
  // Używamy wiadomości Saldo (bo !saldo prawie zawsze dotyczy siebie)
  // oraz komendy !eq bez @mention (eq własny)
  const nameToId = {};
  const threadLastUser = {};

  for (const m of msgs) {
    const tid = String(m.threadId || '');
    const sid = String(m.senderID || '');
    const body = String(m.body || '');

    if (!m.isBotResponse && sid) {
      threadLastUser[tid] = sid;
    }

    if (m.isBotResponse && threadLastUser[tid]) {
      const uid = threadLastUser[tid];

      // Z wiadomości Saldo - pewne mapowanie nazwa→ID
      const saldoMatch = body.match(/Saldo\s*—\s*\*?\*?([^*\n]+)\*?\*?/);
      if (saldoMatch) {
        const name = saldoMatch[1].trim();
        nameToId[name] = uid;
      }

      // Z wiadomości Profil
      const profilMatch = body.match(/Profil\s*—\s*\*?\*?([^*\n]+)\*?\*?/);
      if (profilMatch) {
        const name = profilMatch[1].trim();
        nameToId[name] = uid;
      }
    }
  }

  console.log(`[FIX-EQ] Zmapowano ${Object.keys(nameToId).length} nazw na ID.`);

  // === KROK 2: Parsuj ekwipunki z nagłówka ===
  // Bierzemy OSTATNI eq dla każdego gracza (najświeższe dane)
  const inventoryByName = {};

  for (const m of msgs) {
    const body = String(m.body || '');
    if (!m.isBotResponse) continue;

    const eqMatch = body.match(/Ekwipunek\s*—\s*\*?\*?([^*\n]+)\*?\*?/);
    if (!eqMatch) continue;

    const playerName = eqMatch[1].trim();
    const items = {};
    const lines = body.split('\n');

    for (const line of lines) {
      // Format: "5. 🟫 **Brązowa Paczka** x1" lub "5. 🟫 **Brązowa Paczka** x1 *(Pasywny)*"
      const itemMatch = line.match(/^\d+\.\s*(.+?)\s+x(\d+)/);
      if (itemMatch) {
        let itemName = itemMatch[1].trim();
        // Usuń markdown bold i emoji na początku
        itemName = itemName.replace(/\*\*/g, '').trim();
        // Usuń emoji na początku
        itemName = itemName.replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '').trim();
        const qty = parseInt(itemMatch[2], 10);
        if (itemName && qty > 0) {
          items[itemName] = qty;
        }
      }
    }

    // Zawsze nadpisuj - chcemy najnowsze dane (bo msgs posortowane po ts)
    inventoryByName[playerName] = items;
  }

  console.log(`[FIX-EQ] Znaleziono ekwipunki dla ${Object.keys(inventoryByName).length} nazw graczy.`);

  // === KROK 3: Mapuj nazwy na ID i buduj inventory ===
  const newInventory = {};
  let mapped = 0, unmapped = 0;

  // Najpierw ładujemy aktualny users.json żeby mieć dodatkowe mapowanie name→id
  const usersPath = path.join(DATA_DIR, 'users.json');
  const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  
  // Dodatkowe mapowanie z users.json
  for (const [uid, udata] of Object.entries(users)) {
    if (udata.name) {
      if (!nameToId[udata.name]) {
        nameToId[udata.name] = uid;
      }
    }
  }

  console.log(`[FIX-EQ] Po dodaniu z users.json: ${Object.keys(nameToId).length} mapowań nazwa→ID.`);

  for (const [name, items] of Object.entries(inventoryByName)) {
    const uid = nameToId[name];
    if (uid) {
      newInventory[uid] = items;
      mapped++;
      if (Object.keys(items).length > 0) {
        console.log(`  ✅ ${name} (${uid}): ${Object.keys(items).length} przedmiotów`);
      }
    } else {
      unmapped++;
      if (Object.keys(items).length > 0) {
        console.log(`  ⚠️ NIE ZMAPOWANO: "${name}" - ${Object.keys(items).length} przedmiotów`);
      }
    }
  }

  // Dodaj puste eq dla graczy którzy mają "Brak przedmiotów" 
  // (już są w inventoryByName jako puste obiekty)
  
  // Zachowaj eq graczy z obecnego inventory.json którzy NIE pojawili się w pliku historii
  const currentInv = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'inventory.json'), 'utf8'));
  for (const [uid, items] of Object.entries(currentInv)) {
    if (!newInventory.hasOwnProperty(uid)) {
      newInventory[uid] = items;
    }
  }

  console.log(`\n[FIX-EQ] Wynik: ${mapped} zmapowanych, ${unmapped} niezmapowanych`);
  console.log(`[FIX-EQ] Graczy z przedmiotami: ${Object.values(newInventory).filter(v => Object.keys(v).length > 0).length}`);

  // Zapisz
  for (const dir of [DATA_DIR, SEED_DIR, BACKUP_DIR]) {
    if (fs.existsSync(dir)) {
      saveJson(path.join(dir, 'inventory.json'), newInventory);
    }
  }

  console.log('[FIX-EQ] Gotowe!');
}

main();
