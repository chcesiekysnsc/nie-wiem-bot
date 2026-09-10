/**
 * Automatyczne Logowanie z 2FA (TOTP) przez Puppeteer
 * Generuje kod dwuetapowy w locie (otplib), loguje konto i wyciaga appstate.
 * Po zalogowaniu natychmiast zamyka proces Chromium, zwalniajac 100% RAM-u.
 */

const puppeteer = require('puppeteer');
const { authenticator } = require('otplib');

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

    // Sprawdz czy Facebook prosi o kod 2FA
    const approvalsInput = await page.$('#approvals_code, input[name="approvals_code"]');
    if (approvalsInput) {
      if (!totpSecret) {
        throw new Error('Konto wymaga weryfikacji dwuetapowej 2FA, ale nie podano klucza TOTP!');
      }

      console.log(`[TOTP-LOGIN] Wykryto monit 2FA! Generuje kod z klucza...`);
      const token = authenticator.generate(totpSecret.replace(/\s+/g, '').toUpperCase());
      console.log(`[TOTP-LOGIN] Wprowadzam wygenerowany kod 2FA: ${token}`);

      await approvalsInput.type(token, { delay: 30 });
      await page.click('#checkpointSubmitButton, [type="submit"]');

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

      // Kliknij zatwierdzenie "Zapisz przegladarke" / "Kontynuuj"
      const continueBtn = await page.$('#checkpointSubmitButton, [type="submit"]');
      if (continueBtn) {
        await continueBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      }
    }

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
      throw new Error('Logowanie nie powiodlo sie — brak kluczowych ciasteczek c_user lub xs (mozliwa blokada konta).');
    }

    console.log(`[TOTP-LOGIN] ✅ Sukces! Pozyskano ${appstate.length} ciasteczek appstate dla ${email}.`);
    return appstate;
  } finally {
    // Bezwzglednie zamknij przegladarke, by nie zostawiac procesow w RAM
    await browser.close().catch(() => {});
  }
}

module.exports = { loginWithTotp };
