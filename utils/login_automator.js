const puppeteer = require('puppeteer');
const { TOTP } = require('totp-generator');
const fs = require('fs');
const path = require('path');

async function clickNativeByText(page, texts) {
  const rect = await page.evaluate((texts) => {
    const elements = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a, div, span, p'));
    for (const el of elements) {
      const text = (el.textContent || el.value || '').trim().toLowerCase();
      for (const t of texts) {
        if (text.includes(t.toLowerCase()) && text.length < 100) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, text };
          }
        }
      }
    }
    return null;
  }, texts);

  if (rect) {
    console.log(`[LOGIN-AUTOMATOR] Clicking natively at (${rect.x}, ${rect.y}) for matched text: "${rect.text}"`);
    await page.mouse.click(rect.x, rect.y);
    return rect.text;
  }
  return null;
}

async function runAutomatedLogin() {
  const configPath = path.join(__dirname, '../fca-config.json');
  let credentials = {};

  if (fs.existsSync(configPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      credentials = configData.credentials || {};
    } catch (e) {
      console.error('[LOGIN-AUTOMATOR] Error parsing fca-config.json:', e.message);
    }
  }

  const email = process.env.FB_EMAIL || credentials.email;
  const password = process.env.FB_PASSWORD || credentials.password;
  const twoFactorSecret = process.env.FB_2FA_SECRET || credentials.twofactor;

  if (!email || !password || !twoFactorSecret) {
    console.error('[LOGIN-AUTOMATOR] Error: Missing email, password, or twofactor in fca-config.json/env');
    return false;
  }

  console.log(`[LOGIN-AUTOMATOR] Initiating Puppeteer login for ${email.substring(0, 3)}...`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1');

    console.log('[LOGIN-AUTOMATOR] Navigating to login page...');
    await page.goto('https://m.facebook.com/login/', { waitUntil: 'networkidle2' });

    // Handle cookie consent banners if present
    try {
      const buttons = await page.$$('button');
      let clickedConsent = false;
      for (const button of buttons) {
        const text = (await page.evaluate(el => el.textContent, button)).trim().toLowerCase();
        if (
          text === 'tüm çerezlere izin ver' ||
          text === 'allow all cookies' ||
          text === 'allow all' ||
          text === 'accept all' ||
          text === 'zezwól na wszystkie' ||
          text === 'zezwól na wszystkie pliki cookie'
        ) {
          console.log('[LOGIN-AUTOMATOR] Clicking cookie consent:', text);
          await Promise.all([
            button.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null)
          ]);
          clickedConsent = true;
          break;
        }
      }
      if (!clickedConsent) {
        for (const button of buttons) {
          const text = (await page.evaluate(el => el.textContent, button)).trim().toLowerCase();
          if (text.includes('tüm çerezlere izin ver') || text.includes('allow all') || text.includes('zezwól na wszystkie')) {
            console.log('[LOGIN-AUTOMATOR] Fallback cookie consent click:', text);
            await Promise.all([
              button.click(),
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null)
            ]);
            break;
          }
        }
      }
    } catch (cookieErr) {
      console.log('[LOGIN-AUTOMATOR] Cookie banner check bypassed:', cookieErr.message);
    }

    // Wait for email and password fields
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    await page.waitForSelector('input[name="pass"]', { timeout: 10000 });

    console.log('[LOGIN-AUTOMATOR] Submitting credentials...');
    await page.type('input[name="email"]', email, { delay: 50 });
    await page.type('input[name="pass"]', password, { delay: 50 });

    const loginButtons = await page.$$('button, input[type="submit"], input[type="button"], [role="button"]');
    let clickedLogin = false;
    for (const btn of loginButtons) {
      const text = (await page.evaluate(el => el.textContent || el.value || '', btn)).trim().toLowerCase();
      if (text.includes('giriş yap') || text.includes('log in') || text.includes('zaloguj')) {
        console.log('[LOGIN-AUTOMATOR] Clicking login button:', text);
        await btn.click();
        clickedLogin = true;
        break;
      }
    }
    if (!clickedLogin) {
      const loginBtn = await page.$('input[type="submit"]') || await page.$('button[name="login"]') || await page.$('input[name="login"]');
      if (loginBtn) {
        console.log('[LOGIN-AUTOMATOR] Clicking fallback login button...');
        await loginBtn.click();
      } else {
        throw new Error('Login button not found');
      }
    }

    // Wait for transition (cookie set, 2FA prompt, or checkpoint url)
    console.log('[LOGIN-AUTOMATOR] Processing login redirects...');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const currentUrl = page.url();
      const cookies = await page.cookies();
      const hasCUser = cookies.some(c => c.name === 'c_user');
      const has2FA = await page.$('input[name="approvals_code"]');
      
      if (hasCUser || has2FA || currentUrl.includes('checkpoint')) {
        break;
      }
    }

    // Handle "Check notifications on another device" approval screen if it appears
    const clickedTryAnotherWay = await clickNativeByText(page, ['başka bir yol dene', 'try another way', 'wypróbuj inny sposób']);
    if (clickedTryAnotherWay) {
      console.log('[LOGIN-AUTOMATOR] Bypassing notification approval screen, clicking "Try another way"...');
      await new Promise(r => setTimeout(r, 3000));
      
      // Look for code option
      const clickedOption = await clickNativeByText(page, [
        'kimlik doğrulama kodu', 
        'giriş kodu', 
        'login code', 
        'authentication code',
        'kodu gir'
      ]);
      if (clickedOption) {
        console.log('[LOGIN-AUTOMATOR] Selected authentication code option. Clicking continue...');
        await new Promise(r => setTimeout(r, 1000));
        await clickNativeByText(page, ['devam et', 'continue', 'ileri', 'dalej']);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        const clickedFallback = await clickNativeByText(page, ['kod', 'code']);
        if (clickedFallback) {
          console.log('[LOGIN-AUTOMATOR] Selected fallback code option. Clicking continue...');
          await new Promise(r => setTimeout(r, 1000));
          await clickNativeByText(page, ['devam et', 'continue', 'ileri', 'dalej']);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    // Check if we are at 2FA checkpoint page or if 2FA code is needed
    const hasCodeText = await page.evaluate(() => document.body.innerText.toLowerCase().includes('kod') || document.body.innerText.toLowerCase().includes('code'));
    if (page.url().includes('checkpoint') || await page.$('input[name="approvals_code"]') || hasCodeText) {
      console.log('[LOGIN-AUTOMATOR] 2FA Checkpoint detected. Generating TOTP...');
      const code = TOTP.generate(twoFactorSecret.replace(/\s+/g, '')).otp;
      console.log('[LOGIN-AUTOMATOR] Entering TOTP code...');

      await page.waitForSelector('input[name="approvals_code"]', { timeout: 10000 });
      await page.type('input[name="approvals_code"]', code, { delay: 50 });
      
      const submitBtn = await page.$('button#checkpointSubmitButton') || await page.$('input[type="submit"]');
      if (submitBtn) {
        await Promise.all([
          submitBtn.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null)
        ]);
      } else {
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    // Handle any post-login "Save Browser" (Zapamiętać przeglądarkę) page
    for (let i = 0; i < 3; i++) {
      const currentUrl = page.url();
      if (!currentUrl.includes('checkpoint')) {
        break;
      }
      const continueBtn = await page.$('button#checkpointSubmitButton') || await page.$('input[type="submit"]');
      if (continueBtn) {
        await Promise.all([
          continueBtn.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null)
        ]);
      } else {
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    const cookies = await page.cookies();
    const cUser = cookies.find(c => c.name === 'c_user');
    if (!cUser) {
      const failedUrl = page.url();
      const failedTitle = await page.title().catch(() => 'No Title');
      const failedText = await page.evaluate(() => document.body.innerText.substring(0, 1000)).catch(() => 'No Text');
      console.error(`[LOGIN-AUTOMATOR] Login failed: c_user cookie not found after process.`);
      console.error(`[LOGIN-AUTOMATOR] Current URL: ${failedUrl}`);
      console.error(`[LOGIN-AUTOMATOR] Page Title: ${failedTitle}`);
      console.error(`[LOGIN-AUTOMATOR] Page Text (first 1000 chars):\n${failedText}`);
      
      try {
        const screenshotPath = path.join(__dirname, '../data/login_failed.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`[LOGIN-AUTOMATOR] Saved debug screenshot to: ${screenshotPath}`);
      } catch (err) {
        console.error('[LOGIN-AUTOMATOR] Failed to save screenshot:', err.message);
      }
      
      return false;
    }

    console.log(`[LOGIN-AUTOMATOR] Successfully logged in! User ID: ${cUser.value}`);
    
    // Map to appstate format
    const appState = cookies.map(c => ({
      key: c.name,
      value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      path: c.path || '/',
      hostOnly: !c.domain.startsWith('.'),
      creation: new Date().toISOString(),
      lastAccessed: new Date().toISOString()
    }));

    const appstatePath = path.join(__dirname, '../data/appstate.json');
    fs.writeFileSync(appstatePath, JSON.stringify(appState, null, 2), 'utf8');
    console.log('[LOGIN-AUTOMATOR] Saved fresh cookies to appstate.json');
    return true;
  } catch (err) {
    console.error('[LOGIN-AUTOMATOR] Error during automated credentials login:', err);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { runAutomatedLogin };
