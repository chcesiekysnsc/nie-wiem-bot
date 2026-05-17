# Discord Casino Bot JSON Only

Bot kasynowy na Discord w `Node.js` i `discord.js v14`, zapisujacy wszystkie dane tylko do plikow JSON.

## Bez baz danych

Ten projekt nie uzywa:

- `MongoDB`
- `mongoose`
- `SQLite`
- zadnej zewnetrznej bazy danych

Wszystko zapisuje sie lokalnie w folderze `data/`.

## Wymagania

- `Node.js 20+`

## Instalacja

```bash
npm install
node index.js
```

Uzupelnij tylko `.env`:

```env
DISCORD_TOKEN=your_discord_bot_token
```

## Struktura danych

```text
data/
  users.json
  inventory.json
  cooldowns.json
  logs.json
```

Kazdy command-flow:

1. Czyta JSON
2. Modyfikuje dane
3. Zapisuje JSON

## Glowne komendy

- `!bal`
- `!daily`
- `!work`
- `!crime`
- `!rob @user`
- `!slots 1000`
- `!coinflip 1000 orzel`
- `!roulette 1000 red`
- `!leaderboard`
- `!deposit 1000`
- `!withdraw all`
- `!shop`
- `!inventory`
- `!marry @user`
- `!pfp`
- `!admadd @user 50000`

## Konfiguracja

Edytuj [config.js](/C:/Users/dupek/Desktop/nie%20mam%20pojecia/config/config.js), aby zmienic:

- prefix
- admin IDs
- cooldowny
- anti-spam
- max bet
- shop items
- economy values

Domyslnie admin IDs:

```js
admins: ["123456789"]
```

## Uwagi

- `!admadd` dziala tylko dla ID z `config.admins`.
- `logs.json` przechowuje logi administracyjne i economy.
- `leaderboard` sortuje po `balance`.
- `!pfp` pokazuje avatar, balance, bank, level, xp, games played, total won, total lost, prestige i badges.
