/**
 * Automatyczne logowanie do Facebooka z obsługą 2FA (TOTP)
 * Przetestowane i działające na koncie testowym.
 * 
 * Przepływ:
 * 1. Otwórz facebook.com/login
 * 2. Zamknij modal cookies (turecki/polski/angielski)
 * 3. Wpisz email + hasło, kliknij submit
 * 4. Kliknij "Spróbuj innej metody" (bo FB domyślnie chce powiadomienie na telefon)
 * 5. Wybierz "Aplikacja uwierzytelniająca" (radio button)
 * 6. Kliknij "Kontynuuj"
 * 7. Wygeneruj kod TOTP z klucza Secret i wpisz go
 * 8. Kliknij "Kontynuuj" żeby zatwierdzić kod
 * 9. Kliknij "Kontynuuj" na stronie "Zapisz przeglądarkę"
 * 10. Pobierz ciasteczka c_user, xs, datr, sb
 */

const path = require('path');
const puppeteer = require('puppeteer');
const otplib = require('otplib');

async function loginViaFacebookAPI(email, password, totpSecret = null, proxyUrl = null) {
  console.log(`[AUTH] Logowanie dla ${email}...`);

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
  if (proxyUrl) args.push(`--proxy-server=${proxyUrl}`);

  const browser = await puppeteer.launch({ headless: 'new', args });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // === KROK 1: Otwórz stronę logowania ===
    console.log('[AUTH] Otwieram facebook.com/login...');
    await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2', timeout: 35000 });

    // === KROK 2: Zamknij modal cookies ===
    console.log('[AUTH] Zamykam modal cookies...');
    await new Promise(r => setTimeout(r, 2500));
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (let i = btns.length - 1; i >= 0; i--) {
          const t = (btns[i].innerText || '').trim().toLowerCase();
          if (
            t === 'tüm çerezlere izin ver' ||
            t === 'isteğe bağlı çerezleri reddet' ||
            t.includes('zezwól na wszystkie') ||
            t.includes('odrzuć opcjonalne') ||
            t.includes('allow all') ||
            t.includes('decline optional') ||
            t.includes('accept all') ||
            t.includes('accept cookies')
          ) {
            btns[i].click();
            return;
          }
        }
      });
      await new Promise(r => setTimeout(r, 2000));
    } catch (_) {}

    // === KROK 3: Wpisz dane i wyślij formularz ===
    console.log('[AUTH] Wpisuję dane logowania...');
    await page.waitForSelector('input[name="email"]', { timeout: 15000 });
    await page.type('input[name="email"]', email, { delay: 25 });
    await page.type('input[name="pass"]', password, { delay: 25 });

    console.log('[AUTH] Wysyłam formularz logowania...');
    await page.evaluate(() => {
      const btn = document.querySelector('input[type="submit"], button[name="login"], button[type="submit"], #loginbutton');
      if (btn) btn.click();
    });

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));

    const urlAfterLogin = page.url();
    console.log(`[AUTH] URL po logowaniu: ${urlAfterLogin}`);

    // Sprawdź czy Facebook pokazał błąd (złe hasło / nieznany email)
    const loginError = await page.evaluate(() => {
      const errorDivs = document.querySelectorAll('div[role="alert"], #error_box, ._4rbf, ._9ay7');
      for (const ed of errorDivs) {
        const txt = (ed.innerText || '').trim();
        if (txt) return txt;
      }
      // Sprawdź też tekst pod polami
      const bodyText = document.body.innerText.toLowerCase();
      if (bodyText.includes('girdiğin e-posta') || bodyText.includes('nieprawidłow') || bodyText.includes('incorrect password') || bodyText.includes('wrong credentials')) {
        return document.body.innerText.slice(0, 300);
      }
      return null;
    });

    if (loginError && !urlAfterLogin.includes('two_step_verification') && !urlAfterLogin.includes('two_factor') && !urlAfterLogin.includes('checkpoint')) {
      throw new Error(`Facebook odrzucił logowanie: ${loginError.slice(0, 200)}`);
    }

    // === KROK 4-8: Obsługa 2FA jeśli wymagane ===
    if (urlAfterLogin.includes('two_step_verification') || urlAfterLogin.includes('two_factor') || urlAfterLogin.includes('checkpoint')) {
      console.log('[AUTH] Wykryto weryfikację dwuskładnikową (2FA)...');

      if (!totpSecret) {
        throw new Error('Konto wymaga 2FA, ale nie podano klucza Secret Key ani kodu 6-cyfrowego!');
      }

      // KROK 4: Kliknij "Spróbuj innej metody"
      console.log('[AUTH] Szukam przycisku "Spróbuj innej metody"...');
      await new Promise(r => setTimeout(r, 3000));

      let clickedOther = false;
      const allElements = await page.$$('div[role="button"], button, a');
      for (const el of allElements) {
        const text = await el.evaluate(e => (e.innerText || '').trim());
        if (text.includes('innej metody') || text.includes('another way') || text.includes('başka')) {
          console.log(`[AUTH] Znaleziono przycisk: "${text}" - klikam natywnie...`);
          await el.click();
          clickedOther = true;
          break;
        }
      }

      if (!clickedOther) {
        console.log('[AUTH] Nie znaleziono przycisku, próbuję kliknąć po koordynatach...');
        // Kliknij w obszar gdzie powinien być przycisk (dolna część strony)
        await page.mouse.click(640, 580);
      }

      // Poczekaj na pojawienie się modala
      console.log('[AUTH] Czekam na modal z opcjami 2FA...');
      await new Promise(r => setTimeout(r, 3000));

      // Sprawdź czy modal się pojawił (radio buttony)
      const hasRadios = await page.$('input[type="radio"]');
      if (!hasRadios) {
        // Może strona się przeładowała i od razu pokazała pole na kod?
        const directInput = await page.$('input[type="text"], input[type="number"]');
        if (directInput) {
          console.log('[AUTH] Znaleziono bezpośrednie pole na kod 2FA (bez modala)');
        } else {
          // Zrób screenshot i spróbuj jeszcze raz
          await page.screenshot({ path: path.join(__dirname, '..', 'data', 'before_modal.png') });
          console.log('[AUTH] ⚠️ Modal nie pojawił się. Zrzut: data/before_modal.png. Próbuję ponownie...');
          // Jeszcze jedna próba kliknięcia
          await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('*'));
            for (const el of all) {
              const t = (el.innerText || '').trim();
              if (t === 'Spróbuj innej metody' || t === 'Try another way') {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return;
              }
            }
          });
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // KROK 5: Wybierz "Aplikacja uwierzytelniająca"
      const radios = await page.$$('input[type="radio"]');
      if (radios.length >= 3) {
        console.log(`[AUTH] Znaleziono ${radios.length} opcji 2FA. Klikam 3. (Aplikacja)...`);
        // Kliknij label zawierający 3. radio button (bardziej niezawodne niż sam input)
        await radios[2].evaluate(el => {
          const label = el.closest('label');
          if (label) label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.click();
        });
      } else if (radios.length > 0) {
        console.log(`[AUTH] Tylko ${radios.length} opcji - klikam ostatnią...`);
        await radios[radios.length - 1].click();
      }
      await new Promise(r => setTimeout(r, 1500));

      // KROK 6: Kliknij "Kontynuuj"
      console.log('[AUTH] Klikam "Kontynuuj"...');
      const modalBtns = await page.$$('div[role="button"], button');
      for (const btn of modalBtns) {
        const btnText = await btn.evaluate(e => (e.innerText || '').trim().toLowerCase());
        if (btnText === 'kontynuuj' || btnText === 'continue' || btnText === 'devam et') {
          await btn.click();
          console.log('[AUTH] Kliknięto "Kontynuuj"');
          break;
        }
      }
      await new Promise(r => setTimeout(r, 4000));

      // KROK 7: Wygeneruj kod TOTP i wpisz go
      const cleanSecret = totpSecret.replace(/\s+/g, '').toUpperCase();
      let codeToType = '';
      if (/^\d{6}$/.test(cleanSecret)) {
        // Użytkownik podał gotowy 6-cyfrowy kod
        codeToType = cleanSecret;
        console.log(`[AUTH] Użyto podanego kodu 2FA: ${codeToType}`);
      } else {
        // Wygeneruj kod z klucza TOTP Secret
        codeToType = otplib.generateSync({ secret: cleanSecret });
        console.log(`[AUTH] Wygenerowano kod TOTP: ${codeToType}`);
      }

      // Szukaj pola na kod (input z id _r_b_ lub input[type=text])
      const codeInput = await page.waitForSelector('input#_r_b_, input[type="text"], input[type="number"], input[name*="code"], input[autocomplete="one-time-code"]', { timeout: 15000 });
      await codeInput.type(codeToType, { delay: 35 });

      // KROK 8: Kliknij "Kontynuuj" żeby zatwierdzić kod
      console.log('[AUTH] Zatwierdzam kod 2FA...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"], button'));
        for (const b of btns) {
          const t = (b.innerText || '').trim().toLowerCase();
          if (t === 'kontynuuj' || t === 'continue' || t === 'devam et' || t.includes('zatwierdź') || t.includes('submit')) {
            b.click();
            break;
          }
        }
      });

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
      console.log(`[AUTH] URL po 2FA: ${page.url()}`);
    }

    // === KROK 9: Kliknij przez "Zapisz przeglądarkę" / "Remember browser" ===
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"], button'));
        for (const b of btns) {
          const t = (b.innerText || '').trim().toLowerCase();
          if (t === 'kontynuuj' || t === 'continue' || t === 'devam et' || t.includes('zapisz') || t.includes('save') || t.includes('nie teraz') || t.includes('not now')) {
            b.click();
            break;
          }
        }
      });
      await new Promise(r => setTimeout(r, 3000));
    } catch (_) {}

    // === KROK 10: Pobierz ciasteczka ===
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

    const cUser = appstate.find(c => c.key === 'c_user');
    const xs = appstate.find(c => c.key === 'xs');

    if (!cUser || !xs) {
      const debugPath = path.join(__dirname, '..', 'data', 'login_debug.png');
      await page.screenshot({ path: debugPath }).catch(() => {});
      console.error(`[AUTH] 📸 Zrzut ekranu zapisany do ${debugPath}`);
      throw new Error('Logowanie nie powiodło się — brak ciasteczek c_user/xs. Sprawdź zrzut w data/login_debug.png');
    }

    console.log(`[AUTH] ✅ Zalogowano! UID: ${cUser.value}, ciasteczek: ${appstate.length}`);
    return appstate;
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { loginViaFacebookAPI };
