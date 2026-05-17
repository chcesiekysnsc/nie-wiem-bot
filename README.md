# Messenger Casino Bot JSON Only

Bot kasynowy pod Facebook Messenger w `Node.js`, zapisujacy wszystkie dane tylko do plikow JSON.

## Jak to teraz dziala

- Bot odbiera wiadomosci przez webhook Meta Messenger Platform
- Bot odpowiada przez Messenger Send API
- Uzytkownicy sa identyfikowani po `sender.id` z Messengera
- Dane ekonomii dalej sa zapisywane lokalnie w `data/`

Wazne:
- Dla Messengera to jest `PSID` strony, czyli identyfikator uzytkownika widoczny z perspektywy Twojej strony.
- To nie musi byc globalny Facebook ID konta.

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

Uzupelnij `.env`:

```env
MESSENGER_VERIFY_TOKEN=your_verify_token
MESSENGER_PAGE_ACCESS_TOKEN=your_page_access_token
MESSENGER_PAGE_ID=your_page_id
MESSENGER_APP_SECRET=your_app_secret
MESSENGER_GRAPH_VERSION=v24.0
PORT=3000
```

## Webhook

Domyslnie bot nasluchuje na:

```text
/webhook
```

Przykladowy lokalny adres:

```text
http://localhost:3000/webhook
```

W panelu Meta:

1. Dodaj produkt Messenger do aplikacji.
2. Ustaw webhook URL na publiczny adres serwera zakonczony `/webhook`.
3. Wpisz ten sam `MESSENGER_VERIFY_TOKEN`, ktory masz w `.env`.
4. Podlacz strone i ustaw `MESSENGER_PAGE_ACCESS_TOKEN`.

## Struktura danych

```text
data/
  users.json
  profiles.json
  inventory.json
  cooldowns.json
  logs.json
```

## Komendy

- `!bal`
- `!bal 1234567890123456`
- `!daily`
- `!work`
- `!crime`
- `!rob 1234567890123456`
- `!slots 1000`
- `!coinflip 1000 orzel`
- `!roulette 1000 red`
- `!leaderboard`
- `!deposit 1000`
- `!withdraw all`
- `!shop`
- `!inventory`
- `!inventory 1234567890123456`
- `!marry 1234567890123456`
- `!marry accept 1234567890123456`
- `!pfp`
- `!pfp 1234567890123456`
- `!admadd 1234567890123456 50000`

## Targetowanie innych graczy

Messenger nie ma Discordowych `@mention`, wiec komendy spoleczne uzywaja UID z Messengera.

Dotyczy to glownie:

- `!bal [uid]`
- `!inventory [uid]`
- `!pfp [uid]`
- `!rob <uid>`
- `!marry <uid>`
- `!admadd <uid> <kwota>`

Najbezpieczniej, zeby obie osoby napisaly wczesniej do strony, wtedy bot zna ich profil i PSID.

## Konfiguracja

Edytuj [config.js](/C:/Users/dupek/Desktop/nie%20mam%20pojecia/config/config.js), aby zmienic:

- prefix
- admin IDs
- cooldowny
- anti-spam
- max bet
- shop items
- economy values
- ustawienia webhooka Messengera

## Uwagi

- `!admadd` dziala tylko dla ID z `config.admins`.
- `logs.json` przechowuje logi administracyjne i economy.
- `leaderboard` sortuje po `balance`.
- `profiles.json` przechowuje zapamietane profile Messenger.
