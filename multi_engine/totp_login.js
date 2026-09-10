/**
 * Logowanie przez wewnetrzne API Facebooka (jak GoatBot / AmbientBot)
 * Nie uzywa przegladarki Puppeteer — wysyla zapytanie HTTP bezposrednio
 * do Facebook Mobile API. Szybkie, lekkie, niezawodne.
 */

const path = require('path');
const fca = require('@dongdev/fca-unofficial');

async function loginViaFacebookAPI(email, password, totpSecret = null) {
  console.log(`[API-LOGIN] Logowanie konta ${email} przez Facebook Mobile API...`);

  const twoFactor = totpSecret ? totpSecret.replace(/\s+/g, '').toUpperCase() : null;

  const result = await fca.loginViaAPI(email, password, twoFactor);

  if (!result || !result.status) {
    const msg = (result && result.message) ? result.message : 'Nieznany blad logowania przez API.';
    console.error(`[API-LOGIN] ❌ Blad: ${msg}`);
    throw new Error(`Logowanie przez API nie powiodlo sie: ${msg}`);
  }

  console.log(`[API-LOGIN] ✅ Sukces! UID: ${result.uid}`);

  // Przekonwertuj cookies na format appstate kompatybilny z FCA login()
  let appstate = null;

  if (result.cookies && Array.isArray(result.cookies)) {
    // Juz w formacie tablicy
    appstate = result.cookies;
  } else if (result.cookie && typeof result.cookie === 'string') {
    // Format stringa "c_user=123; xs=abc; ..." -> tablica obiektow
    appstate = result.cookie.split(';').map(pair => {
      const [key, ...rest] = pair.trim().split('=');
      return {
        key: key.trim(),
        value: rest.join('=').trim(),
        domain: '.facebook.com',
        path: '/',
        hostOnly: false,
        creation: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      };
    }).filter(c => c.key && c.value);
  } else {
    throw new Error('Logowanie zwrocilo sukces, ale brak ciasteczek w odpowiedzi.');
  }

  // Sprawdz czy mamy kluczowe ciasteczka
  const hasCUser = appstate.some(c => c.key === 'c_user');
  const hasXs = appstate.some(c => c.key === 'xs');

  if (!hasCUser || !hasXs) {
    console.warn(`[API-LOGIN] ⚠️ Brak c_user lub xs w cookies, ale logowanie zwrocilo sukces. Uzywam pelnego zestawu.`);
  }

  console.log(`[API-LOGIN] Pozyskano ${appstate.length} ciasteczek dla ${email} (UID: ${result.uid}).`);
  return appstate;
}

module.exports = { loginViaFacebookAPI };
