/**
 * Multi-Account Bot Master Runner
 * Glowny punkt startowy calego klastra wielu kont.
 */

const path = require('path');
const express = require('express');
const commandRegistry = require('./command_registry');
const economyMaster = require('./economy_master');
const accountManager = require('./account_manager');
const { initDatabase, getActiveAccounts, pool, addAccount, updateAccountLoginMeta, updateAccountAppstate } = require('./db');
const { loginWithTotp } = require('./totp_login');
const { loginWithHttpFirst } = require('./fb_http_login');
const manualCodeInbox = require('./manual_codes');

// ============ Zdarzenia klastra (log + historia + powiadomienie do grupy adminów) ============
const recentEvents = [];
const MAX_EVENTS = 100;
const NOTIFY_EVENTS = new Set(['checkpoint', 'checkpoint_blocked', 'login_failed', 'waiting_2fa_code']);

function pushEvent(evt) {
  recentEvents.push(evt);
  if (recentEvents.length > MAX_EVENTS) recentEvents.shift();

  const tag = {
    checkpoint: '🚨 CHECKPOINT',
    checkpoint_blocked: '🛑 CHECKPOINT (limit dzienny)',
    login_failed: '❌ LOGIN FAILED',
    online: '✅ ONLINE',
    onboarding: '🌐 ONBOARDING (Puppeteer)',
    waiting_2fa_code: '📲 CZEKAM NA KOD 2FA'
  }[evt.name] || evt.name.toUpperCase();
  console.log(`[EVENT] (${evt.email || 'konto #' + evt.accountId}) ${tag}: ${evt.message}`);

  if (NOTIFY_EVENTS.has(evt.name)) {
    notifyAdminGroup(evt).catch(() => {});
  }
}

// Best-effort: pierwszy ONLINE account z klastra wrzuca alert do grupy adminów
async function notifyAdminGroup(evt) {
  try {
    const config = require('../config/config');
    const group = config.adminGroupId;
    if (!group) return;
    const online = accountManager.getOnlineApis();
    if (online.length === 0) return;
    const text = `🚨 [MULTI-BOT] Konto ${evt.email || 'id ' + evt.accountId}: ${evt.message}`;
    await new Promise((resolve, reject) => {
      online[0].api.sendMessage(text, group, (err) => (err ? reject(err) : resolve()));
    });
  } catch (e) {
    // powiadomienie nie moze zawieszac klastra
  }
}

accountManager.onEvent(pushEvent);

async function bootstrap() {
  console.log('====================================================');
  console.log('       WOJTEK BOT - MULTI-ACCOUNT ENGINE CLUSTER    ');
  console.log('====================================================');

  // 1. Inicjalizacja bazy danych PostgreSQL
  await initDatabase();

  // 2. Ladowanie wszystkich 180+ komend DOKLADNIE RAZ do pamieci RAM (Singleton)
  const commandsDir = path.join(__dirname, '..', 'commands');
  commandRegistry.load(commandsDir);

  // 3. Uruchomienie globalnego zarzadcy ekonomii (podatki, loterie, resety)
  economyMaster.start(accountManager);

  // 4. Wczytanie i uruchomienie aktywnych kont
  try {
    const accounts = await getActiveAccounts();
    console.log(`[BOOT] Znaleziono ${accounts.length} aktywnych kont w bazie danych.`);
    await accountManager.startAll(accounts);
  } catch (err) {
    console.error('[BOOT] Blad wczytywania kont z bazy:', err.message);
  }

  // 5. Prosty serwer Web Panelu dla uzytkownikow i monitoringu
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Endpoint statusu klastra
  app.get('/api/status', (req, res) => {
    res.json({
      activeBots: accountManager.getStatus(),
      totalCommandsLoaded: commandRegistry.getAll().length,
      memoryUsage: process.memoryUsage()
    });
  });

  // Endpoint dodawania nowego konta.
  // Model: konto jest zapisywane OD RAZU (otrzymuje ID), a logowanie przegladarkowe
  // dziala w tle. Dzieki temu, gdy FB poprosi o kod 2FA / kod z emaila, operator
  // moze NATYCHMIAST podac kod z tej samej strony: POST /api/accounts/:id/2fa-code.
  app.post('/api/accounts/add', async (req, res) => {
    const { email, password, totpSecret, proxyUrl } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Wymagany jest email i haslo!' });
    }

    try {
      // 1) Zapisz konto w bazie (bez appstate) — haslo zostaje dla przyszlego
      //    onboarding/odzyskiwania. TODO: zaszyfrowac (np. AES z kluczem z env).
      const newAccount = await addAccount({
        email,
        password,
        totp_secret: totpSecret || null,
        appstate: null,
        proxy_url: proxyUrl || null,
        login_slot: null
      });

      // 2) "Zatrzymaj" slot na 24h — podczas logowania w tle scheduler
      //    nie ma prawa startowac tego konta podwaznie.
      const holdSlot = new Date(Date.now() + 24 * 3600e3).toISOString();
      newAccount.login_slot = holdSlot;
      await updateAccountLoginMeta(newAccount.id, { login_slot: holdSlot }).catch(() => {});

      // 3) Zarejestruj instancje, zebys widzial ja w panelu od razu
      const instance = accountManager.register(newAccount);
      instance.status = 'CONNECTING';
      pushEvent({
        ts: new Date().toISOString(), name: 'onboarding', accountId: newAccount.id, email,
        message: `Konto #${newAccount.id} zapisane — trwa automatyczne logowanie w tle ` +
          `(najpierw szybka sciezka HTTP bez przegladarki; jak poprosi o kod 2FA — wklej go w polu ponizej)...`
      });

      // 4) Logowanie w tle z dostawca kodu "z reki" (skrzynka manualCodeInbox).
      //    Sciana HTTP (bez przegladarki) jest odporniejsza na zmiany FB;
      //    przy bledzie technicznym jest fallback na Puppeteer.
      (async () => {
        try {
          const appstate = await loginWithHttpFirst(
            email, password, totpSecret || null, proxyUrl || null,
            {
              manualCodeProvider: () => manualCodeInbox.awaitManualCode(newAccount.id, {
                timeoutMs: 180000,
                label: email
              }),
              maxCodeAttempts: 2
            }
          );

          const nowIso = new Date().toISOString();
          newAccount.appstate = appstate;
          newAccount.login_slot = nowIso;
          await updateAccountAppstate(newAccount.id, appstate);
          await updateAccountLoginMeta(newAccount.id, { login_slot: nowIso });
          await accountManager.registerAndStart(newAccount);
        } catch (err) {
          instance.status = 'ERROR';
          console.error(`[API] Tlowe logowanie konta ${email} nie powiodlo sie:`, err.message);
          pushEvent({
            ts: new Date().toISOString(), name: 'login_failed', accountId: newAccount.id, email,
            message: `Tlowe logowanie nie powiodlo sie: ${err.message}` +
              (err && err.code === 'CHECKPOINT_MANUAL'
                ? ' — podaj kod w polu "Kod 2FA" na panelu albo kliknij "Loguj ponownie" przy koncie.'
                : '')
          });
        }
      })();

      res.json({
        success: true,
        accountId: newAccount.id,
        message: `Konto #${newAccount.id} (${email}) zapisane. Bot loguje sie w tle (najpierw bez przegladarki) — sledz status w tabeli; jesli FB poprosi o kod, wklej go w polu ponizej formularza.`
      });
    } catch (err) {
      console.error(`[API] Blad rejestracji konta ${email}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Lista kont ze statusami i slotami logowan
  app.get('/api/accounts', (req, res) => {
    res.json(accountManager.getStatus());
  });

  // Historia zdarzen klastra (checkpointy, logowania, onboarding)
  app.get('/api/events', (req, res) => {
    res.json(recentEvents.slice(-50).reverse());
  });

  // Reczne ponowne logowanie konta (np. po odblokowaniu checkpointu).
  // Body: { forcePuppeteer?: true } — wymusza sciezke przegladarkowa (kod 2FA + "To bylem ja")
  app.post('/api/accounts/:id/relogin', async (req, res) => {
    try {
      const result = await accountManager.startAccountById(req.params.id, {
        forcePuppeteer: !!(req.body && req.body.forcePuppeteer)
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Podanie 6-cyfrowego kodu 2FA / kodu z emaila dla konta czekajacego w
  // przegladarce (monit 2FA albo "kod wyslany na email/telefon").
  app.post('/api/accounts/:id/2fa-code', async (req, res) => {
    try {
      const result = manualCodeInbox.submitManualCode(req.params.id, req.body && req.body.code);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Wklejenie swiezego appstate po recznym przejściu checkpointu
  // (przegladarka z proxy tego konta -> ciasteczka c_user/xs -> tutaj).
  app.post('/api/accounts/:id/appstate', async (req, res) => {
    try {
      const result = await accountManager.setAppStateById(req.params.id, req.body && req.body.appstate);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const PORT = process.env.MULTI_PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PANEL] Multi-Account Web API dziala na porcie ${PORT}`);
  });
}

// Obsluga bezpiecznego zamykania
process.on('SIGINT', () => {
  console.log('\n[CLUSTER] Zamykanie instancji...');
  economyMaster.stop();
  accountManager.stopAll();
  process.exit(0);
});

bootstrap().catch(err => {
  console.error('[FATAL] Blad startu klastra:', err);
  process.exit(1);
});
