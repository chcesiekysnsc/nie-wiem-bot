/**
 * Multi-Account Bot Master Runner
 * Glowny punkt startowy calego klastra wielu kont.
 */

const path = require('path');
const express = require('express');
const commandRegistry = require('./command_registry');
const economyMaster = require('./economy_master');
const accountManager = require('./account_manager');
const { initDatabase, getActiveAccounts, pool, addAccount, updateAccountLoginMeta } = require('./db');
const { loginWithTotp } = require('./totp_login');

// ============ Zdarzenia klastra (log + historia + powiadomienie do grupy adminów) ============
const recentEvents = [];
const MAX_EVENTS = 100;
const NOTIFY_EVENTS = new Set(['checkpoint', 'checkpoint_blocked', 'login_failed']);

function pushEvent(evt) {
  recentEvents.push(evt);
  if (recentEvents.length > MAX_EVENTS) recentEvents.shift();

  const tag = {
    checkpoint: '🚨 CHECKPOINT',
    checkpoint_blocked: '🛑 CHECKPOINT (limit dzienny)',
    login_failed: '❌ LOGIN FAILED',
    online: '✅ ONLINE',
    onboarding: '🌐 ONBOARDING (Puppeteer)'
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

  // Endpoint dodawania nowego konta z 2FA (onboarding przez Puppeteer)
  app.post('/api/accounts/add', async (req, res) => {
    const { email, password, totpSecret, proxyUrl } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Wymagany jest email i haslo!' });
    }

    try {
      console.log(`[API] Rozpoczynam automatyczne logowanie dla ${email}...`);
      const appstate = await loginWithTotp(email, password, totpSecret, proxyUrl);

      // Zapisz konto w bazie (PostgreSQL lub local fallback).
      // Haslo zostaje w bazie — potrzebne do onboarding/odzyskiwania przez Puppeteer.
      // TODO: zaszyfrowac (np. AES z kluczem z env) przed produkcyjnym użyciem.
      const newAccount = await addAccount({
        email,
        password,
        totp_secret: totpSecret,
        appstate,
        proxy_url: proxyUrl,
        login_slot: new Date().toISOString() // onboarding juz w locie
      });

      // Uruchom nowe konto w locie w klastrze
      await accountManager.registerAndStart(newAccount);

      res.json({
        success: true,
        message: `Konto #${newAccount.id} (${email}) zostalo pomyslnie zalogowane i uruchomione!`,
        accountId: newAccount.id
      });
    } catch (err) {
      console.error(`[API] Blad rejestracji konta ${email}:`, err.message);
      const code = err && err.code;
      res.status(500).json({
        error: err.message,
        ...(code === 'CHECKPOINT_MANUAL' ? { requiresManual: true } : {})
      });
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
