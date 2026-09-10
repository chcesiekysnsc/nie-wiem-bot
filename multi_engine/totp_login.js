/**
 * Niezalezne, bezpieczne logowanie do Facebooka (Lokalny Chromium)
 * Nie wysyla hasel na zadne zewnetrzne serwery (w przeciwienstwie do minhdong.site / HTTP 530).
 * Obsluguje:
 * - Automatyczne zamykanie banerow cookies
 * - Logowanie z obsluga dynamicznych formularzy FB
 * - Generowanie i wprowadzanie kodow 2FA (zarowno klucz Secret jak i gotowy kod 6 cyfr)
 * - Obsluge monitu "Wyprobuj inny sposob" (gdy FB chce powiadomienia na telefon)
 * - Wykrywanie bledow (zle haslo, bledny email) i czytelny komunikat
 */

const path = require('path');
const puppeteer = require('puppeteer');
const { authenticator } = require('otplib');

async function loginViaFacebookAPI(email, password, totpSecret = null, proxyUrl = null) {
  console.log(`[AUTH] Bezpieczne logowanie dla ${email}...`);

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
    '--lang=pl-PL,pl,en-US,en'
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

    // Maskowanie automatyzacji przed Facebookiem
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    console.log('[AUTH] Wchodze na facebook.com/login...');
    await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2', timeout: 35000 });

    // 1. Poczekaj na zaladowanie okna cookies i zamknij je
    console.log('[AUTH] Czekam na okno cookies...');
    await new Promise(r => setTimeout(r, 2500));
    try {
      const dismissed = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (const b of btns) {
          const t = (b.innerText || '').trim().toLowerCase();
          if (t.includes('tüm çerezlere izin ver') || t.includes('zezwól na wszystkie') || t.includes('allow all') || t.includes('reddet') || t.includes('decline') || t.includes('odrzuć') || t.includes('akceptuj') || t.includes('accept') || t.includes('izin ver') || t.includes('zezwól')) {
            b.click();
            return t;
          }
        }
        return null;
      });
      if (dismissed) console.log(`[AUTH] Zamknieto okno cookies: ${dismissed}`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (_) {}

    // 2. Wpisz e-mail i haslo
    const emailSelector = 'input[name="email"], #email, input[type="text"]';
    const passSelector = 'input[name="pass"], #pass, input[type="password"]';

    await page.waitForSelector(emailSelector, { timeout: 15000 });
    await page.type(emailSelector, email, { delay: 25 });
    await page.type(passSelector, password, { delay: 25 });

    // 3. Kliknij przycisk zatwierdzenia
    console.log('[AUTH] Wysylam formularz logowania...');
    await page.evaluate(() => {
      const btn = document.querySelector('input[type="submit"], button[name="login"], button[type="submit"], #loginbutton, [data-testid="royal_login_button"]');
      if (btn) {
        btn.click();
        return;
      }
      const allBtns = Array.from(document.querySelectorAll('[role="button"]'));
      for (const b of allBtns) {
        const t = (b.innerText || '').toLowerCase();
        if (t.includes('zaloguj') || t.includes('log in') || t.includes('giriş')) {
          b.click();
          return;
        }
      }
      // Fallback: submit formularza
      const form = document.querySelector('form');
      if (form) form.submit();
    });

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    const currentUrl = page.url();
    console.log(`[AUTH] URL po wyslaniu: ${currentUrl}`);

    // Sprawdz czy Facebook wyrzucil blad hasla / konta
    const pageError = await page.evaluate(() => {
      // 1. Alert boxy i kontenery błędów
      const errorDivs = document.querySelectorAll('div[role="alert"], #error_box, ._4rbf, ._9ay7, .uiContextualLayer');
      for (const ed of errorDivs) {
        const txt = (ed.innerText || '').trim();
        if (txt) return txt;
      }
      // 2. Tekst pod polami wejściowymi
      const inputs = document.querySelectorAll('input[name="email"], input[name="pass"]');
      for (const inp of inputs) {
        const p = inp.closest('div')?.parentElement;
        if (p) {
          const errs = p.querySelectorAll('div[id*="error"], span, div');
          for (const el of errs) {
            const txt = (el.innerText || '').trim();
            if (txt && (txt.includes('nieprawidłow') || txt.includes('błędn') || txt.includes('nie jest') || txt.includes('girdiğin') || txt.includes('şifre') || txt.includes('incorrect') || txt.includes('wrong') || txt.includes('not connected'))) {
              return txt;
            }
          }
        }
      }
      return null;
    });

    if (pageError) {
      throw new Error(`Facebook odrzucil logowanie: ${pageError}`);
    }

    // 4. Obsluga 2FA / Weryfikacji dwuetapowej
    // Jesli FB pokazuje "Powiadomienie na telefon", kliknij "Wyprobuj inny sposob"
    try {
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, [role="button"], span'));
        for (const l of links) {
          const t = (l.innerText || '').toLowerCase();
          if (t.includes('inny sposób') || t.includes('another way') || t.includes('inna metoda')) {
            l.click();
            break;
          }
        }
      });
      await new Promise(r => setTimeout(r, 1500));

      // Wybierz aplikacje uwierzytelniajaca jesli jest lista
      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('label, div[role="radio"], [role="button"]'));
        for (const it of items) {
          const t = (it.innerText || '').toLowerCase();
          if (t.includes('aplikacja uwierzytelniająca') || t.includes('authentication app')) {
            it.click();
            break;
          }
        }
      });
      await new Promise(r => setTimeout(r, 1000));
    } catch (_) {}

    // Szukaj pola na kod 2FA
    const twoFaSelector = 'input[name="approvals_code"], input[autocomplete="one-time-code"], input[type="number"], input[name="code"], #approvals_code';
    let approvalsInput = await page.$(twoFaSelector);
    if (!approvalsInput) {
      approvalsInput = await page.waitForSelector(twoFaSelector, { timeout: 5000 }).catch(() => null);
    }

    if (approvalsInput) {
      if (!totpSecret) {
        throw new Error('Konto ma wlaczone 2FA, ale nie wpisano klucza Secret ani kodu w formularzu!');
      }

      let codeToType = '';
      const cleanSecret = totpSecret.replace(/\s+/g, '');
      if (/^\d{6}$/.test(cleanSecret)) {
        // Uzytkownik wpisal bezposrednio aktualny 6-cyfrowy kod
        codeToType = cleanSecret;
        console.log(`[AUTH] Uzywam podanego kodu 2FA: ${codeToType}`);
      } else {
        // Uzytkownik podal klucz TOTP Secret Key -> generujemy kod
        codeToType = authenticator.generate(cleanSecret.toUpperCase());
        console.log(`[AUTH] Wygenerowano kod z klucza TOTP: ${codeToType}`);
      }

      await approvalsInput.type(codeToType, { delay: 40 });

      // Zatwierdz kod 2FA
      await page.evaluate(() => {
        const btn = document.querySelector('#checkpointSubmitButton, button[type="submit"], [role="button"]');
        if (btn) btn.click();
      });

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2500));

      // Kliknij "Zapisz przegladarke" / "Kontynuuj" jesli sie pojawi
      try {
        await page.evaluate(() => {
          const btn = document.querySelector('#checkpointSubmitButton, button[type="submit"], [role="button"]');
          if (btn) btn.click();
        });
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      } catch (_) {}
    }

    // 5. Pobierz ciasteczka sesyjne
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
      const debugPath = path.join(__dirname, '..', 'data', 'login_debug.png');
      await page.screenshot({ path: debugPath }).catch(() => {});
      console.error(`[AUTH] 📸 Zapisano podglad bledu do ${debugPath}`);
      throw new Error(`Nie udalo sie pobrac ciasteczek sesji (c_user/xs). Sprawdz dane lub zrzut w data/login_debug.png`);
    }

    const cUserVal = appstate.find(c => c.key === 'c_user')?.value;
    console.log(`[AUTH] ✅ Sukces! Pobrane ciasteczka dla FB UID: ${cUserVal}`);
    return appstate;
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { loginViaFacebookAPI };
