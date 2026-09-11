/**
 * Automatyczne Logowanie z 2FA (TOTP) przez Puppeteer
 * Generuje kod dwuetapowy w locie (otplib), loguje konto i wyciaga appstate.
 * Po zalogowaniu natychmiast zamyka proces Chromium, zwalniajac 100% RAM-u.
 *
 * Rozszerzone o obsluge checkpointu LOKALIZACYJNEGO ("Czy to Ty? / That was me"):
 * - monit 2FA -> kod TOTP generowany w locie,
 * - checkpoint lokalizacyjny -> klik "To bylem ja / That was me",
 * - kod wyslany na email/telefon -> NIE da sie obslugic automatycznie,
 *   wyrzucamy bled z err.code === 'CHECKPOINT_MANUAL' (interwencja admina,
 *   a potem wklejenie swiezego appstate przez panel /api/accounts/:id/appstate).
 */

const puppeteer = require('puppeteer');

const WAIT_MS = (ms) => new Promise(r => setTimeout(r, ms));

// Selektory pola kodu 2FA — FB zmienial markup kilka razy:
// stary: #approvals_code / name="approvals_code";
// nowy: dynamiczne ID (np. #_r_b_) + autocomplete="one-time-code".
// Kladziemy je w kolejosci od najbardziej szczegolowego.
const TWO_FA_INPUT_SELECTORS = [
  '#approvals_code',
  'input[name="approvals_code"]',
  'input[autocomplete="one-time-code"]',
  'input[id^="_r_"][type="text"]',
  'input[name*="code" i]',
  'input[type="number"]'
];

/** Znajduje pole kodu 2FA (dowolna znana generacja marku FB) albo zwraca null. */
async function findTwoFaInput(page) {
  for (const sel of TWO_FA_INPUT_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) return el;
    } catch (_) { /* nastepny selektor */ }
  }
  return null;
}

function safePageUrl(page) {
  try { return typeof page.url === 'function' ? page.url() : ''; } catch (_) { return ''; }
}

// Stan "sciany kontrolnej" FB (czytane w srodowisku strony):
// - codeSent: tekst FB o wyslaniu kodu na email/telefon (sciana emailowa)
// - hasUnfilledCodeInput: niedopelnione pole wygladajace na pole kodu
async function readCheckpointWallState() {
  const text = (document.body && document.body.innerText) || '';
  const codeSent = /sent (a |you a |the )?code (to|for)|kod (do )?(weryfikacji|potwierdzenia)/i.test(text);
  let hasUnfilledCodeInput = false;
  const inputs = document.querySelectorAll('input:not([type="hidden"])');
  for (const el of inputs) {
    if (el.id === 'approvals_code') continue; // pole z monitu 2FA to nie sciana
    const name = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
    const looksLikeCodeField = /code/.test(name)
      || el.getAttribute('autocomplete') === 'one-time-code'
      || el.type === 'number';
    if (looksLikeCodeField && !el.value) { hasUnfilledCodeInput = true; break; }
  }
  return { codeSent, hasUnfilledCodeInput };
}

/**
 * Generowanie kodu TOTP z klucza — kompatybilne z dwoma generacjami otplib:
 * - stary (authenticator.generate(secret))
 * - nowy  (await generate({ secret }) -> string)
 */
async function generateTotpCode(secret) {
  const key = String(secret || '').replace(/\s+/g, '').toUpperCase();
  if (!key) throw new Error('Brak klucza TOTP do wygenerowania kodu 2FA.');

  const otp = require('otplib');
  if (otp.authenticator && typeof otp.authenticator.generate === 'function') {
    return otp.authenticator.generate(key);
  }
  if (typeof otp.generate === 'function') {
    const code = await otp.generate({ secret: key });
    const value = typeof code === 'string' ? code : (code && code.value);
    if (!/^\d{6}$/.test(String(value || ''))) {
      throw new Error('Generowanie kodu 2FA nie powiodło się (nieprawidłowy klucz TOTP?).');
    }
    return value;
  }
  throw new Error('Nieznany format API zainstalowanego pakietu otplib.');
}

/**
 * Wpisuje kod w znalezionym polu 2FA i zatwierdza; zwraca true gdy monit zniknal.
 */
async function typeCodeAndSubmit(page, code) {
  const input = await findTwoFaInput(page);
  if (!input) return true; // ekran i tak sie zmienil
  await input.click().catch(() => {});
  await input.type(String(code).trim(), { delay: 30 });
  const submit = await page.$('#checkpointSubmitButton, [type="submit"], [name="submit"]');
  if (submit) {
    await submit.click().catch(() => {});
  }
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await WAIT_MS(2000);
  return !(await findTwoFaInput(page));
}

/**
 * Przechodzi ekrany po logowaniu: 2FA (kod TOTP z klucza LUB kod podany przez
 * czlowieka), checkpoint lokalizacyjny ("That was me") i sciana "kod wyslany
 * na email/telefon" (takze z podaniem kodu przez czlowieka).
 *
 * options:
 *  - manualCodeProvider: async ({attempt, context}) => string
 *      Dostawca kodu "z reki" — panel (POST /api/accounts/:id/2fa-code) albo
 *      konsola (stdin). Wywoływany, gdy brakuje klucza TOTP albo gdy FB
 *      wysyla kod na email (tu TOTP i tak nie pomaga).
 *  - maxCodeAttempts: ile razy prosic o kod (domyślnie 2 — kod zyje ~30s)
 *
 * @returns {Promise<boolean>} true gdy doszlo do normalnej strony po logowaniu
 * @throws {Error} err.code === 'CHECKPOINT_MANUAL' gdy kodu nie da sie uzyskac
 */
async function handlePostLoginCheckpoint(page, totpSecret, options = {}) {
  const manualCodeProvider = typeof options.manualCodeProvider === 'function' ? options.manualCodeProvider : null;
  const maxAttempts = options.maxCodeAttempts || 2;

  // Daj stronie FB chwile na dobicie przekierowan
  await WAIT_MS(2500);

  // Wstępny stan ekranu — tekst "wyslalismy kod na email/telefon" pozwala
  // rozroznic sciane emailową od zwyklego monitu 2FA (oba maja pole kodu).
  const initialState = await page.evaluate(readCheckpointWallState);
  const initialCodeInput = await findTwoFaInput(page);
  const isEmailWall = !!initialState.codeSent;

  // ============ 1) Monit 2FA (kod TOTP / z reki) LUB sciana emailowa od razu ============
  if (initialCodeInput) {
    let passed = false;
    for (let attempt = 1; attempt <= maxAttempts && !passed; attempt++) {
      let code = null;

      if (!isEmailWall && totpSecret) {
        try {
          code = await generateTotpCode(totpSecret);
          console.log(`[TOTP-LOGIN] Wykryto monit 2FA! Wprowadzam wygenerowany kod: ${code}`);
        } catch (e) {
          console.error('[TOTP-LOGIN] Błąd generowania kodu TOTP:', e.message);
        }
      }

      if (!code && manualCodeProvider) {
        console.log(isEmailWall
          ? `[TOTP-LOGIN] FB wyslal kod na email/telefon — czekam na kod od użytkownika (próba ${attempt}/${maxAttempts})...`
          : `[TOTP-LOGIN] Czekam na kod 2FA od użytkownika (próba ${attempt}/${maxAttempts})...`);
        try {
          code = await manualCodeProvider({ attempt, context: isEmailWall ? 'email_code' : '2fa' });
        } catch (e) {
          console.error('[TOTP-LOGIN] Brak kodu od użytkownika:', e.message);
        }
      }

      if (!code) break;
      passed = await typeCodeAndSubmit(page, code);
      if (!passed) {
        console.log('[TOTP-LOGIN] Kod nie zostal zaakceptowany (błędny/przeterminowany).');
      }
    }

    if (!passed) {
      const err = new Error(
        (isEmailWall
          ? 'Kod z emaila/telefonu nie przeszedl weryfikacji (brak kodu, przeterminowany lub błędny).'
          : 'Kod 2FA nie przeszedl: brak klucza TOTP, brak kodu od użytkownika albo kod odrzucony.') +
        ` (Strona: ${safePageUrl(page)})`
      );
      err.code = 'CHECKPOINT_MANUAL';
      throw err;
    }
  }

  // 2) Checkpoint lokalizacyjny: "This is an unusual browser location — That was me / To bylem ja"
  const clickedThatWasMe = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], a[role="button"]'));
    const re = /that was me|this was me|to by[\u0142l]em ja|to jestem ja|tak, to by[\u0142l]em/i;
    for (const el of candidates) {
      const text = ((el.innerText || '') + ' ' + (el.value || '')).trim();
      if (re.test(text)) {
        try { el.click(); return true; } catch (_) { /* ignoruj */ }
      }
    }
    return false;
  });

  if (clickedThatWasMe) {
    console.log(`[TOTP-LOGIN] Checkpoint lokalizacyjny — kliknieto "To bylem ja / That was me".`);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await WAIT_MS(2500);
  }

  // 3) Czy doszlo do kodu wyslanego na email/telefon (nie da sie go automatycznie odczytac)?
  const state = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll(
      'input[type="text"], input[type="number"], input[name*="code" i], input[autocomplete="one-time-code"]'
    ));
    const body = (document.body && document.body.innerText) || '';
    const codeSent = /sent (a )?code|wys[\u0142l]alism(y|y) kod|kod weryfikacyjny|confirmation code/i.test(body);
    const hasUnfilledCodeInput = inputs.some(i => {
      const name = String(i.name || '').toLowerCase();
      const isCodeLike =
        name.includes('code') ||
        i.autocomplete === 'one-time-code' ||
        (i.type === 'number' && name !== 'approvals_code');
      return !i.value && isCodeLike && name !== 'approvals_code';
    });
    return { codeSent, hasUnfilledCodeInput, onCheckpoint: /checkpoint/i.test(location.href) };
  });

  if (state.codeSent || state.hasUnfilledCodeInput) {
    const codeInput = await findTwoFaInput(page);

    if (codeInput && manualCodeProvider) {
      // Czlowiek odczyta kod z emaila/telefonu konta i poda go botowi
      let passed = false;
      for (let attempt = 1; attempt <= maxAttempts && !passed; attempt++) {
        console.log(`[TOTP-LOGIN] FB wyslal kod na email/telefon — czekam na kod od użytkownika (próba ${attempt}/${maxAttempts})...`);
        let code;
        try {
          code = await manualCodeProvider({ attempt, context: 'email_code' });
        } catch (e) {
          console.error('[TOTP-LOGIN] Brak kodu od użytkownika:', e.message);
          break;
        }
        if (!code) break;
        passed = await typeCodeAndSubmit(page, code);
        if (!passed) {
          console.log('[TOTP-LOGIN] Kod z emaila/telefonu nie przeszedl — prosze o aktualny kod.');
        }
      }

      if (!passed) {
        const err = new Error(
          `Kod z emaila/telefonu nie przeszedl weryfikacji (brak kodu, przeterminowany lub błędny). (Strona: ${safePageUrl(page)})`
        );
        err.code = 'CHECKPOINT_MANUAL';
        throw err;
      }
    } else {
      const err = new Error(
        `Facebook wyslal kod weryfikacyjny na email/telefon konta i nie ma podlaczonego dostawcy kodów ręcznych — ` +
        `checkpoint trzeba odblokowac recznie (przegladarka z proxy tego konta), a potem wkleic swiezy appstate przez panel. (Strona: ${safePageUrl(page)})`
      );
      err.code = 'CHECKPOINT_MANUAL';
      throw err;
    }
  }

  return true;
}

async function loginWithTotp(email, password, totpSecret = null, proxyUrl = null, options = {}) {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu'
  ];

  if (proxyUrl) {
    args.push(`--proxy-server=${proxyUrl}`);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    console.log(`[TOTP-LOGIN] Logowanie konta ${email}...`);
    await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2', timeout: 30000 });

    // Wypelnij login i haslo
    await page.waitForSelector('#email', { timeout: 10000 });
    await page.type('#email', email, { delay: 30 });
    await page.type('#pass', password, { delay: 30 });
    await page.click('#loginbutton, [name="login"]');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

    // 2FA + checkpoint lokalizacyjny w jednym miejscu
    await handlePostLoginCheckpoint(page, totpSecret, options);

    // Wyciagnij ciasteczka sesyjne
    const cookies = await page.cookies();
    const appstate = cookies
      .filter(c => ['c_user', 'xs', 'fr', 'datr', 'sb'].includes(c.name))
      .map(c => ({
        key: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        hostOnly: !c.domain.startsWith('.'),
        creation: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      }));

    const hasCUser = appstate.some(c => c.key === 'c_user');
    const hasXs = appstate.some(c => c.key === 'xs');

    if (!hasCUser || !hasXs) {
      // Jesli zostalismy na ekranie checkpointu — to wymaga recznej interwencji
      const url = page.url();
      const err = new Error(`Logowanie nie powiodlo sie — brak kluczowych ciasteczek c_user/xs (URL: ${url}). Możliwa blokada/checkpoint.`);
      if (/checkpoint/i.test(url)) {
        err.code = 'CHECKPOINT_MANUAL';
      }
      throw err;
    }

    console.log(`[TOTP-LOGIN] ✅ Sukces! Pozyskano ${appstate.length} ciasteczek appstate dla ${email}.`);
    return appstate;
  } finally {
    // Bezwzglednie zamknij przegladarke, by nie zostawiac procesow w RAM
    await browser.close().catch(() => {});
  }
}

module.exports = { loginWithTotp, handlePostLoginCheckpoint, generateTotpCode };
