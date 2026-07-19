# MIGRACJA BOTA NA POSTGRESQL — INSTRUKCJA KROK PO KROKU

## WYMAGANIA

- Node.js >= 18
- Konto Supabase (darmowy tier wystarczy: https://supabase.com)
- Bot obecnie działa na Railway (lub lokalnie)

---

## KROK 1 — UTWÓRZ PROJEKT SUPABASE

1. Wejdź na https://app.supabase.com
2. Zarejestruj się / zaloguj
3. Kliknij **New Project**
4. Wybierz organizację
5. Nazwa projektu: np. `bot-economy`
6. Hasło do bazy: **zapisz je** (potrzebne do DATABASE_URL)
7. Region: wybierz najbliższy (np. `eu-west-1`)
8. Kliknij **Create new project**
9. Poczekaj 1-2 minuty aż projekt się utworzy

---

## KROK 2 — SKOPIUJ DATABASE_URL

1. W Supabase Dashboard przejdź do **Settings** (ikona koła zębatego)
2. Wybierz **Database**
3. Przewiń do sekcji **Connection string**
4. Wybierz zakładkę **URI**
5. Skopiuj connection string
   - Format: `postgresql://postgres:[HASLO]@db.[PROJECT-REF].supabase.co:5432/postgres`
6. Zapisz go bezpiecznie — będziesz potrzebował w .env

---

## KROK 3 — ZAINSTALUJ ZALEŻNOŚCI

```bash
npm install pg dotenv
```

Jeśli używasz Railway, dodaj też zmienne środowiskowe tam.

---

## KROK 4 — UTWÓRZ PLIK .env

W głównym katalogu projektu stwórz plik `.env`:

```env
DATABASE_URL=postgresql://postgres:[TWOJE_HASLO]@db.[PROJECT-REF].supabase.co:5432/postgres
```

Zamień `[TWOJE_HASLO]` i `[PROJECT-REF]` na wartości z Supabase.

---

## KROK 5 — URUCHOM schema.sql W SUPABASE

1. W Supabase Dashboard przejdź do **SQL Editor** (ikona terminala)
2. Kliknij **New query**
3. Wklej CAŁĄ zawartość pliku `database/schema.sql`
4. Kliknij **Run** (lub Ctrl+Enter)
5. Poczekaj na potwierdzenie: `Success. No rows returned`

Sprawdź czy wszystkie tabele zostały utworzone:
- Przejdź do **Table Editor**
- Powinieneś zobaczyć listę tabel (users, inventory, gangs, itp.)

---

## KROK 6 — ZROB BACKUP STARYCH DANYCH

```bash
mkdir -p backup/json
cp data/*.json backup/json/
```

Lub uruchom migration.js — automatycznie zrobi backup.

---

## KROK 7 — URUCHOM MIGRACJĘ

```bash
node database/migration.js
```

Co się stanie:
1. Sprawdzi połączenie z PostgreSQL
2. Zrobi backup starych plików JSON do `backup/json/`
3. Przeczytai wszystkie pliki JSON z `data/`
4. Zaimportuje dane do PostgreSQL
5. Zainicjuje wersję bazy danych

Oczekiwany wynik:
```
=== ROZPOCZYNAM MIGRACJĘ ===

[1/8] Backup starych plików JSON...
  [BACKUP] users.json → backup/json/users.json
  ...

[2/8] Migracja użytkowników...
  Zmi­growano 1234 użytkowników

...

=== MIGRACJA ZAKOŃCZONA SUKCESEM ===
```

---

## KROK 8 — SPRAWDŹ DANE W SUPABASE

1. Przejdź do **Table Editor** w Supabase
2. Sprawdź tabele:
   - `users` — powinno być X rekordów
   - `inventory` — powinno być Y rekordów
   - `gangs` — powinno być Z rekordów
   - `transactions` — historia operacji

Jeśli dane się zgadzają, przejdź do następnego kroku.

---

## KROK 9 — ZMIEN KOD BOTA

### 9.1 Zmień importy w plikach

Zamiast:
```javascript
const { loadData } = require('./utils/storage');
const users = loadData('users');
```

Zastąp:
```javascript
const db = require('./database');
const user = await db.users.getByMessengerId(message.author.id);
```

### 9.2 Zaktualizuj pliki komend

Przykład dla `commands/sklep.js`:

**PRZED:**
```javascript
const { loadData } = require('../utils/storage');
const users = loadData('users');
const inventory = loadData('inventory');
```

**PO:**
```javascript
const db = require('../database');
const users = await db.users.getAll();
const inventory = await db.items.getInventory(user.id);
```

### 9.3 Aktualizuj utils/storage.js

Jeśli nie chcesz od razu zmieniać całego kodu, możesz:
1. Zostawić `utils/storage.js` jako warstwę kompatybilności
2. Wewnątrz `loadData()` używać PostgreSQL zamiast plików
3. Stopniowo przechodzić na nowe repozytoria

Szybki patch dla `utils/storage.js`:

```javascript
const db = require('./database');
const USE_POSTGRES = !!process.env.DATABASE_URL;

async function loadData(key) {
  if (!USE_POSTGRES) {
    // stara logika z plikami JSON
  }

  switch (key) {
    case 'users':
      const users = await db.users.getAll();
      const result = {};
      for (const u of users) {
        result[u.messenger_id] = u;
      }
      return result;
    case 'inventory':
      return await db.items.getAllInventory();
    // ... reszta kluczy
    default:
      return {};
  }
}
```

---

## KROK 10 — TESTUJ BOTA

1. Uruchom bota lokalnie:
   ```bash
   node self_bot.js
   ```

2. Sprawdź czy:
   - Bot się loguje
   - Komendy działają
   - Dane są zapisywane w PostgreSQL
   - Cooldowny działają
   - Ekonomia działa (pieniądze się zapisują)

3. Sprawdź logi — nie powinno być błędów związanych z bazą danych

---

## KROK 11 — WERSJONOWANIE BAZY

Przyszłe migracje:

```bash
# 1. Stwórz plik migracji
# database/migrations/002_add_new_feature.sql

# 2. Uruchom na Supabase SQL Editor

# 3. Zaktualizuj wersję
node -e "
const db = require('./database');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('INSERT INTO database_version (version) VALUES (''1.1.0'') ON CONFLICT (version) DO NOTHING');
pool.end();
"
```

---

## KROK 12 — DEPLOY NA RAILWAY

1. Zaktualizuj zmienne środowiskowe w Railway:
   - `DATABASE_URL` = twój connection string z Supabase

2. Wypchnij kod:
   ```bash
   git add .
   git commit -m "feat: migrate to PostgreSQL"
   git push origin main
   ```

3. Railway automatycznie zrestartuje bota

---

## KROK 13 — BACKUP I OCHRONA

### Backup automatyczny Supabase:
- Supabase automatycznie robi backupy codziennie
- Przechowuje je przez 7-30 dni (w zależności od planu)

### Export danych:
```bash
# Eksport tabeli users
pg_dump $DATABASE_URL --table users --data-only --column-inserts > users_backup.sql

# Eksport całej bazy
pg_dump $DATABASE_URL > full_backup.sql
```

### Monitorowanie:
- W Supabase Dashboard → **Database** → **Backups**
- Sprawdzaj rozmiar bazy i liczbę zapytań

---

## KROK 14 — CO DALEJ?

Po migracji możesz:

1. **Dodawać nowe tabele** bez zmiany istniejących danych
2. **Dodawać nowe kolumny** przez `ALTER TABLE`
3. **Dodawać nowe rekordy** do `items`, `game_events`, `game_config` bez kodu
4. **Skalować** — PostgreSQL obsłuży tysiące użytkowników
5. **Analityka** — zapytania SQL do analizy danych

---

## CZĘSTE PROBLEMY

### Problem: `password authentication failed`
**Rozwiązanie:** Sprawdź czy DATABASE_URL ma poprawne hasło z Supabase.

### Problem: `relation "users" does not exist`
**Rozwiązanie:** Upewnij się że uruchomiłeś `schema.sql` w Supabase SQL Editor.

### Problem: Migracja się zawiesza
**Rozwiązanie:** Sprawdź logi. Jeśli problem z konkretnym rekordem, możesz:
```bash
# Uruchom z pominięciem błędów (zmień migration.js)
```

### Problem: Bot nadal używa JSON
**Rozwiązanie:** Sprawdź czy `DATABASE_URL` jest ustawione. Jeśli tak, bot powinien używać PostgreSQL.

---

## WYMAGANE ZMIANY W KODZIE — LISTA PLIKÓW

Pliki które musisz zaktualizować:

1. `commands/sklep.js` — użyj `db.items` i `db.users`
2. `commands/eq.js` — użyj `db.items.getInventory()`
3. `commands/bal.js` — użyj `db.users.getByMessengerId()`
4. `commands/work.js` — użyj `db.users` i `db.items`
5. `commands/crime.js` — użyj `db.users` i `db.items`
6. `commands/daily.js` — użyj `db.users`
7. `commands/rob.js` — użyj `db.users` i `db.items`
8. `commands/gang.js` — użyj `db.gangs` i `db.users`
9. `commands/firma.js` — użyj `db.companies`
10. `utils/storage.js` — zmień `loadData()` na PostgreSQL
11. `utils/cooldowns.js` — zmień na `db.cooldowns`
12. `commands/terytoria.js` — użyj `db.gangs`

**LUB** użyj warstwy kompatybilności opisanej w Krok 9.3.

---

## KONTAKT

Jeśli masz problemy z migracją, sprawdź:
1. Logi bota
2. Logi Supabase (Dashboard → Logs)
3. Tabele w Supabase (Table Editor)

Powodzenia!
