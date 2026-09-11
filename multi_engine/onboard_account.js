/**
 * SKRYPT ONBOARDINGU KONTA DO KLAstra MULTI-ACCOUNT
 * ---------------------------------------------------
 * Uruchamiaj na maszynie, ktora moze trafic na facebook.com (Railway / Twój serwer).
 * W tym sandboxie FB jest zablokowane proxyem, dlatego onboarding musi odbyc sie tam.
 *
 * UZYTKOWANIE (dane w env — NIGDY nie hardkoduj ich w kodzie):
 *   EMAIL=dupek3214321@gmail.com \
 *   PASSWORD='...' \
 *   TOTP_SECRET='BKZI CGYQ KDIQ KY7V ZDE6 IPQZ ZR6I CVHX' \
 *   PROXY_URL='http://user:pass@host:port' \   # opcjonalnie (ale zalecane: stały residential IP per konto)
 *   node multi_engine/onboard_account.js
 *
 * Przeplyw:
 *   1. Logowanie przegladarkowe (Puppeteer) — obsluguje kod 2FA z klucza TOTP
 *      i checkpoint lokalizacyjny "To bylem ja / That was me".
 *      Jesli FB zyla kod na email/telefon → skrypt zatrzyma sie z instrukcja
 *      (przejdź checkpoint recznie w przegladarce z tym samym IP, a potem
 *      wklej swiezy appstate przez panel: POST /api/accounts/:id/appstate).
 *   2. Zapis konta w bazie klastra (appstate + dane logowania do przyszlego onboarding).
 *   3. Logowanie FCA + start nasluchiwania (realny AccountManager).
 *   4. TEST: napisz do tego konta w Messengerze (PV) komende !wersja
 *      i sprawdź, czy bot odpowie.
 *
 * UWAGA: Nie uruchamiaj tego skryptu obok dzialajacego multi_bot.js
 * (dwa klastera = podwojne logowanie tego samego konta = checkpointy).
 */

require('dotenv').config();

const { initDatabase, addAccount } = require('./db');
const accountManager = require('./account_manager');
const { loginWithTotp, generateTotpCode } = require('./totp_login');

(async () => {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  const totpSecret = process.env.TOTP_SECRET || null;
  const proxyUrl = process.env.PROXY_URL || null;

  if (!email || !password) {
    console.error('[ONBOARD] Brak zmiennych EMAIL lub PASSWORD.');
    console.error('[ONBOARD] Przyklad: EMAIL=a@b.c PASSWORD=x TOTP_SECRET=... PROXY_URL=... node multi_engine/onboard_account.js');
    process.exit(1);
  }

  // 0) Szybka weryfikacja klucza 2FA (zanim uruchomimy przegladarke)
  if (totpSecret) {
    try {
      const code = await generateTotpCode(totpSecret);
      console.log(`[ONBOARD] ✅ Klucz TOTP poprawny (przykladowy kod: ${code}).`);
    } catch (e) {
      console.error(`[ONBOARD] ❌ Klucz TOTP nie dziala: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.warn('[ONBOARD] ⚠️ Brak TOTP_SECRET — jesli konto ma włączony 2FA, onboarding wymaga klucza.');
  }

  await initDatabase();

  // Zdarzenia klastra na konsolę
  accountManager.onEvent((e) => {
    console.log(`[EVENT] (${e.email || '#' + e.accountId}) ${e.name}: ${e.message}`);
  });

  // 1) Logowanie przegladarkowe
  console.log(`[ONBOARD] Uruchamiam przegladarke i loguje ${email} (proxy: ${proxyUrl || 'bezproxy'})...`);
  let appstate;
  try {
    appstate = await loginWithTotp(email, password, totpSecret, proxyUrl);
  } catch (err) {
    if (err && err.code === 'CHECKPOINT_MANUAL') {
      console.error('[ONBOARD] ❌ ' + err.message);
      console.error('[ONBOARD] Co robic:');
      console.error('  1) Otworz przegladarke z TYM SAMYM IP/proxy co ten skrypt.');
      console.error('  2) Zaloguj sie recznie na konto i odblokuj checkpoint (kod z maila/telefonu).');
      console.error('  3) Po zalogowaniu wklej swiezy appstate do panelu: POST /api/accounts/:id/appstate');
      console.error('     albo ponownie uruchom ten skrypt (po odblokowaniu z tym samym IP zwykle przechodzi samo).');
      process.exit(2);
    }
    throw err;
  }
  console.log(`[ONBOARD] ✅ Appstate pozyskane (${appstate.length} ciasteczek, c_user+xs: OK).`);

  // 2) Zapis w bazie klastra
  const acc = await addAccount({
    email,
    password,
    totp_secret: totpSecret,
    appstate,
    proxy_url: proxyUrl,
    login_slot: new Date().toISOString()
  });
  console.log(`[ONBOARD] ✅ Konto zapisane w bazie klastra: #${acc.id}`);

  // 3) Logowanie FCA + start
  const instance = accountManager.register(acc);
  await instance.start();

  // Daj logowaniu fca chwile na dobicie
  for (let i = 0; i < 10 && instance.status === 'CONNECTING'; i++) {
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[ONBOARD] Status konta: ${instance.status}`);
  if (instance.status === 'ONLINE') {
    const botId = instance.api && instance.api.getCurrentUserID && instance.api.getCurrentUserID();
    console.log(`[ONBOARD] ✅ KONTO JEST ONLINE jako FB ID: ${botId}`);
    console.log('');
    console.log('────────────────────────────────────────────────────────────');
    console.log('TEST: otworz Messengera i napisz do tego konta (PV):  !wersja');
    console.log('Bot powinien odpisac statusem. Nastepnie przetestuj np. !bal.');
    console.log('────────────────────────────────────────────────────────────');
  } else {
    console.log(`[ONBOARD] ⚠️ Konto nie wyszlo online (status: ${instance.status}).`);
    console.log('[ONBOARD] Zobacz wyzej logi [EVENT] i [BOT #1]. Możliwe przyczyny:');
    console.log('[ONBOARD]  - checkpoint FB (wloguj sie recznie z tego IP i odblokuj),');
    console.log('[ONBOARD]  - proxy martwy/zmieniony (trzymaj zawsze ten sam IP per konto),');
    console.log('[ONBOARD]  - sesja odrzucona (ponów onboarding przez ten skrypt).');
  }

  // Zachowaj cluster w zyciu (chyba ze tylko onboarding był celem)
  if (process.env.EXIT_AFTER_ONBOARD === 'true') {
    console.log('[ONBOARD] EXIT_AFTER_ONBOARD=true — wychodze po onboarding.');
    process.exit(0);
  }
  console.log('[ONBOARD] Skrypt pozostaje w pamieci jako dzialajacy cluster (Ctrl+C, aby zakończyc).');
  // cluster zywi sie sama soba; nie robimy niczego w nieskonczonosc
})().catch((e) => {
  console.error('[ONBOARD] FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
