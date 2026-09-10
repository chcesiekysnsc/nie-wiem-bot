/**
 * Multi-Account Bot Master Runner
 * Glowny punkt startowy calego klastra wielu kont.
 */

const path = require('path');
const express = require('express');
const commandRegistry = require('./command_registry');
const economyMaster = require('./economy_master');
const accountManager = require('./account_manager');
const { initDatabase, getActiveAccounts, pool } = require('./db');
const { loginWithTotp } = require('./totp_login');

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

  // Endpoint dodawania nowego konta z 2FA (tak jak w AmbientBot)
  app.post('/api/accounts/add', async (req, res) => {
    const { email, password, totpSecret, proxyUrl } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Wymagany jest email i haslo!' });
    }

    try {
      console.log(`[API] Rozpoczynam automatyczne logowanie dla ${email}...`);
      const appstate = await loginWithTotp(email, password, totpSecret, proxyUrl);

      // Zapisz konto w bazie (PostgreSQL lub local fallback)
      const newAccount = await addAccount({
        email,
        totp_secret: totpSecret,
        appstate,
        proxy_url: proxyUrl
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
      res.status(500).json({ error: err.message });
    }
  });

  const PORT = process.env.MULTI_PORT || 3001;
  app.listen(PORT, () => {
    console.log(`[PANEL] Multi-Account Web API dziala na porcie http://localhost:${PORT}`);
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
