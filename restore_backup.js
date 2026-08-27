const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./utils/storage');

const BACKUP_FILE = path.join(__dirname, 'backup_database.json');
const OUTPUT_DIR = DATA_DIR;

function main() {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(`❌ Nie znaleziono pliku backupu: ${BACKUP_FILE}`);
    console.error('   Upewnij się, że plik backup_database.json jest w tym samym folderze co ten skrypt.');
    process.exit(1);
  }

  console.log(`📦 Wczytuję backup z: ${BACKUP_FILE}`);
  const raw = fs.readFileSync(BACKUP_FILE, 'utf8');

  let backup;
  try {
    backup = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Plik backupu nie jest poprawnym JSON-em:', err.message);
    process.exit(1);
  }

  const fileKeys = Object.keys(backup);
  if (fileKeys.length === 0) {
    console.error('❌ Backup jest pusty — brak plików do rozpakowania.');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Utworzono folder: ${OUTPUT_DIR}`);
  }

  let restoredCount = 0;
  let skippedCount = 0;

  for (const fileName of fileKeys) {
    if (!fileName.endsWith('.json') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      console.warn(`⚠️  Pomijam podejrzaną nazwę pliku: ${fileName}`);
      skippedCount++;
      continue;
    }

    const targetPath = path.join(OUTPUT_DIR, fileName);
    const content = backup[fileName];

    if (fileName === 'appstate.json' && fs.existsSync(targetPath)) {
      console.log(`   ↳ Pomijam przywracanie appstate.json (plik z sesją już istnieje na dysku)`);
      skippedCount++;
      continue;
    }

    let outputText;
    if (typeof content === 'string') {
      outputText = content;
    } else {
      outputText = JSON.stringify(content, null, 2);
    }

    if (fs.existsSync(targetPath)) {
      const backupOfExisting = targetPath + '.before_restore.bak';
      fs.copyFileSync(targetPath, backupOfExisting);
      console.log(`   ↳ Istniejący plik zabezpieczony jako: ${path.basename(backupOfExisting)}`);
    }

    fs.writeFileSync(targetPath, outputText, 'utf8');
    console.log(`✅ Odtworzono: data/${fileName} (${outputText.length.toLocaleString()} znaków)`);
    restoredCount++;
  }

  console.log('\n=================================================');
  console.log(`🎉 Zakończono! Odtworzono ${restoredCount} plików, pominięto ${skippedCount}.`);
  console.log(`📂 Sprawdź folder: ${OUTPUT_DIR}`);
  console.log('=================================================');
}

main();
