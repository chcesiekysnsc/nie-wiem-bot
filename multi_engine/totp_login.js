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
    
    // Stealth: ukryj flagi automatyzacji przed Facebookiem
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`[TOTP-LOGIN] Wchodze na strone logowania dla ${email}...`);
    await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2', timeout: 35000 });

    // 1. Obsluz ewentualny monit o pliki cookies
    try {
      const cookieButtons = await page.$$('button, div[role="button"]');
      for (const btn of cookieButtons) {
        const text = (await page.evaluate(el => el.innerText || '', btn)).toLowerCase();
        if (text.includes('zezwól') || text.includes('zaakceptuj') || text.includes('allow') || text.includes('accept') || text.includes('izin ver')) {
          await btn.click().catch(() => {});
          await new Promise(r => setTimeout(r, 1200));
          break;
        }
      }
    } catch (_) {}

    // 2. Wypelnij login i haslo
    const emailSelector = 'input[name="email"], #email, input[type="text"]';
    const passSelector = 'input[name="pass"], #pass, input[type="password"]';

    await page.waitForSelector(emailSelector, { timeout: 15000 });
    await page.type(emailSelector, email, { delay: 30 });
    await page.type(passSelector, password, { delay: 30 });

    // Kliknij przycisk logowania lub wcisnij Enter
    const loginBtn = await page.$('button[name="login"], button[type="submit"], input[type="submit"], #loginbutton, [data-testid="royal_login_button"]');
    if (loginBtn) {
      await loginBtn.click().catch(() => {});
    } else {
      await page.keyboard.press('Enter');
    }

    console.log('[TOTP-LOGIN] Wyslano formularz logowania, czekam na odpowiedz...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    console.log(`[TOTP-LOGIN] Aktualny URL: ${page.url()}`);
    console.log(`[TOTP-LOGIN] Tytul strony: ${await page.title()}`);

    // Sprawdz czy jest opcja "Wyprobuj inny sposob" (gdy FB chce powiadomienia na telefon zamiast kodu)
    try {
      const tryAnotherWays = await page.$$('a, div[role="button"], span');
      for (const el of tryAnotherWays) {
        const t = (await page.evaluate(e => e.innerText || '', el)).toLowerCase();
        if (t.includes('inny sposób') || t.includes('another way') || t.includes('aplikacja uwierzytelniająca') || t.includes('authentication app')) {
          await el.click().catch(() => {});
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
      }
    } catch (_) {}

    // 3. Sprawdz czy Facebook prosi o kod 2FA
    const twoFaSelector = 'input[name="approvals_code"], input[autocomplete="one-time-code"], input[type="number"], #approvals_code';
    let approvalsInput = await page.$(twoFaSelector);
    if (!approvalsInput) {
      approvalsInput = await page.waitForSelector(twoFaSelector, { timeout: 6000 }).catch(() => null);
    }

    if (approvalsInput) {
      if (!totpSecret) {
        throw new Error('Konto wymaga weryfikacji 2FA, ale nie podano klucza TOTP Secret!');
      }

      console.log(`[TOTP-LOGIN] Wykryto monit 2FA! Generuje kod z klucza...`);
      const token = authenticator.generate(totpSecret.replace(/\s+/g, '').toUpperCase());
      console.log(`[TOTP-LOGIN] Wprowadzam wygenerowany kod 2FA: ${token}`);

      await approvalsInput.type(token, { delay: 40 });
      await page.keyboard.press('Enter');

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));

      // Kliknij zatwierdzenie "Zapisz przegladarke" / "Kontynuuj"
      try {
        const confirmBtn = await page.$('#checkpointSubmitButton, button[type="submit"], [role="button"]');
        if (confirmBtn) {
          await confirmBtn.click().catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
        }
      } catch (_) {}
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
      // Zapisz screenshot bledu do diagnozy
      const debugScreenshot = path.join(__dirname, '..', 'data', 'login_debug.png');
      await page.screenshot({ path: debugScreenshot }).catch(() => {});
      console.error(`[TOTP-LOGIN] 📸 Zapisano zrzut ekranu do ${debugScreenshot}`);
      throw new Error(`Logowanie nie powiodlo sie — brak ciasteczek c_user lub xs. Aktualny adres: ${page.url()} (Sprawdz haslo lub zrzut ekranu w data/login_debug.png)`);
    }

    console.log(`[TOTP-LOGIN] ✅ Sukces! Pozyskano ${appstate.length} ciasteczek appstate dla ${email}.`);
    return appstate;
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { loginWithTotp };
