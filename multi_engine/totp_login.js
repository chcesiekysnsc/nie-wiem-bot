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
const { authenticator } = require('otplib');

const WAIT_MS = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Przechodzi ekrany po logowaniu: 2FA (TOTP) oraz checkpoint lokalizacyjny.
 * @returns {Promise<boolean>} true gdy doszlo do normalnej strony po logowaniu
 * @throws {Error} err.code === 'CHECKPOINT_MANUAL' gdy wymagany jest kod z emaila/telefonu
 */
async function handlePostLoginCheckpoint(page, totpSecret) {
  // Daj stronie FB chwile na dobicie przekierowan
  await WAIT_MS(2500);

  // 1) Monit 2FA (TOTP)
  const approvalsInput = await page.$('#approvals_code, input[name="approvals_code"]');
  if (approvalsInput) {
    if (!totpSecret) {
      const err = new Error('Konto wymaga weryfikacji 2FA, a nie podano klucza TOTP — podaj totp_secret w panelu.');
      err.code = 'CHECKPOINT_MANUAL';
      throw err;
    }

    console.log(`[TOTP-LOGIN] Wykryto monit 2FA! Generuje kod z klucza...`);
    const token = authenticator.generate(totpSecret.replace(/\s+/g, '').toUpperCase());
    console.log(`[TOTP-LOGIN] Wprowadzam wygenerowany kod 2FA: ${token}`);

    await approvalsInput.type(token, { delay: 30 });
    const submit = await page.$('#checkpointSubmitButton, [type="submit"]');
    if (submit) {
      await submit.click().catch(() => {});
    }
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await WAIT_MS(2000);
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
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[name*="code" i]'));
    const body = (document.body && document.body.innerText) || '';
    const codeSent = /sent (a )?code|wys[\u0142l]alism(y|y) kod|kod weryfikacyjny|confirmation code/i.test(body);
    const hasUnfilledCodeInput = inputs.some(i => {
      const name = String(i.name || '').toLowerCase();
      return !i.value && name.includes('code') && name !== 'approvals_code';
    });
    return { codeSent, hasUnfilledCodeInput, onCheckpoint: /checkpoint/i.test(location.href) };
  });

  if (state.codeSent || state.hasUnfilledCodeInput) {
    const err = new Error(
      'Facebook wyslal kod weryfikacyjny na email/telefon konta — checkpoint trzeba odblokowac recznie ' +
      '(przegl\u0105darka z proxy tego konta), a potem wkleic swiezy appstate przez panel.'
    );
    err.code = 'CHECKPOINT_MANUAL';
    throw err;
  }

  return true;
}

async function loginWithTotp(email, password, totpSecret = null, proxyUrl = null) {
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
    await handlePostLoginCheckpoint(page, totpSecret);

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

module.exports = { loginWithTotp, handlePostLoginCheckpoint };
