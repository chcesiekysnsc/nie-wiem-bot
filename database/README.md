# Database Layer

Warstwa dostępu do danych PostgreSQL dla bota.

## Struktura

```
database/
├── config.js              # Pool połączeń PostgreSQL
├── schema.sql             # Pełny schemat bazy danych
├── migration.js           # Skrypt migracji JSON → PostgreSQL
├── test-db.js             # Test połączenia z bazą
├── MIGRATION_GUIDE.md     # Szczegółowa instrukcja migracji
├── migrations/            # Przyszłe migracje wersji
│   └── 001_initial_schema.sql
└── repositories/          # Repozytoria (warstwa dostępu do danych)
    ├── index.js
    ├── users.js
    ├── items.js
    ├── gangs.js
    ├── companies.js
    ├── cooldowns.js
    ├── events.js
    └── transactions.js
```

## Szybki start

```bash
# 1. Zainstaluj zależności
npm install pg dotenv

# 2. Ustaw DATABASE_URL w .env
cp .env.example .env

# 3. Uruchom schema.sql w Supabase SQL Editor

# 4. Uruchom migrację
node database/migration.js

# 5. Test połączenia
node test-db.js
```

## Użycie w komendach

```javascript
const db = require('../database');

// Użytkownicy
const user = await db.users.getByMessengerId(message.author.id);

// Ekwipunek
const inventory = await db.items.getInventory(user.id);
const hasItem = await db.items.hasItem(user.id, 'vip');

// Bonusy
const workBonus = await db.items.getUserBonus(user.id, 'work_bonus');

// Gangi
const gang = await db.gangs.getByName('WKF');
const members = await db.gangs.getMembers(gang.id);

// Cooldowny
const cooldown = await db.cooldowns.getCooldown(user.id, 'work');

// Eventy
const activeEvents = await db.events.getActive();
const multiplier = await db.events.getMultiplier('casino');
```

## Wersjonowanie

Tabela `database_version` przechowuje aktualną wersję schematu.

Przyszłe migracje dodawaj w `database/migrations/`.

## Backup

Stare pliki JSON są automatycznie kopiowane do `backup/json/` podczas migracji.

Supabase robi automatyczne backupy codziennie.
