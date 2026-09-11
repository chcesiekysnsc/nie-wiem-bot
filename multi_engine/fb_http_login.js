/**
 * Logowanie FB BEZ przegladarki (metoda znana m.in. z GoatBota).
 *
 * Cziste requesty HTTP do mobilnego Facebooka (m.facebook.com), udawajacego
 * przegladarke mobilna (Android UA + odcisk urzadzenia bi_wvdp). W razie
 * porazki technicznej — awaryjna sciezka mbasic.facebook.com (FB bez JS).
 *
 * Kluczowa roznica wobec sciezki Puppeteer: BRAC selektorow HTML. Czytamy
 * tylko pola formularzy (fb_dtsg, jazoest, approvals_code...), wiec
 * przemeblowanie designu FB (dynamiczne ID typu #_r_b_ itd.) nie lamie
 * logowania tak latwo.
 *
 * Obsluga checkpointow:
 *  - monit 2FA / "kod wyslany na email/telefon" -> kod TOTP z klucza (jak
 *    jest) LUB kod podany przez operatora (options.manualCodeProvider —
 *    to ta sama skrzynka, co panel: POST /api/accounts/:id/2fa-code),
 *  - checkpoint lokalizacyjny ("This was me / That was me") -> automatyczne
 *    potwierdzenie przyciskiem z formularza,
 *  - "Login approval needed" -> blad (wymaga weryfikacji na zwyklym urzadzeniu),
 *  - twardy checkpoint (checkpoint/<liczba>) -> blad CHECKPOINT_MANUAL.
 *
 * Kody bledow (err.code):
 *  - WRONG_ACCOUNT       — zly email/haslo (nie warto probowac ponownie),
 *  - CHECKPOINT_MANUAL   — wymaga kodu z reki albo recznego odblokowania,
 *  - LOGIN_FORM_NOT_FOUND / LOGIN_FAILED — inne problemy.
 *
 * Zwraca appstate w tym samym formacie co totp_login.js
 * (tablica {key, value, domain, path, hostOnly, creation, lastAccessed}).
 */

const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');
const { CookieJar } = require('tough-cookie');

const { generateTotpCode } = require('./totp_login');

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36';

const MOBILE_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'accept-language': 'en-US,en;q=0.8',
  'sec-ch-ua': '" Not;A Brand";v="99", "Microsoft Edge";v="103", "Chromium";v="103"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1'
};

// Odcisk "urzadzenia" (sygnały przeglądarki) — bez niego FB częściej checkpointuje.
const BI_WVDP = '{"hwc":true,"hwcr":true,"has_dnt":true,"has_standalone":false,"wnd_toStr_toStr":"function toString() { [native code] }","hasPerm":true,"permission_query_toString":"function query() { [native code] }","permission_query_toString_toString":"function query() { [native code] }","has_seWo":true,"has_meDe":true,"has_creds":true,"has_hwi_bt":false,"has_agjsi":false,"iframeProto":"function get contentWindow() { [native code] }","remap":false,"iframeData":{"hwc":true,"hwcr":false,"has_dnt":true,"has_standalone":false,"wnd_toStr_toStr":"function toString() { [native code] }","hasPerm":true,"permission_query_toString":"function query() { [native code] }","permission_query_toString_toString":"function query() { [native code] }","has_seWo":true,"has_meDe":true,"has_creds":true,"has_hwi_bt":false,"has_agjsi":false}}';

const CORE_COOKIES = ['c_user', 'xs', 'fr', 'datr', 'sb'];

function errWith(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Konwertuje proxyUrl (np. http://u:p@h:1080) na konfiguracje proxy dla axiosa. */
function axiosProxyFromUrl(proxyUrl) {
  if (!proxyUrl) return false;
  try {
    const u = new URL(proxyUrl);
    return {
      protocol: 'http',
      host: u.hostname,
      port: Number(u.port) || 80,
      auth: u.username ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password || '') } : undefined
    };
  } catch (_) {
    return false;
  }
}

/**
 * Sesja HTTP z jarrem ciasteczek (tough-cookie) i naglowkami mobilnymi.
 * Nie podsciaga przekierowan (maxRedirects: 0) — decydujemy, gdzie idziemy.
 */
class FbHttpSession {
  constructor({ proxyUrl = null } = {}) {
    this.jar = new CookieJar();
    this.client = axios.create({
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 30000,
      headers: { ...MOBILE_HEADERS, 'user-agent': MOBILE_UA },
      proxy: axiosProxyFromUrl(proxyUrl),
      httpAgent: undefined
    });
  }

  async request(method, url, { form = null, referer = null } = {}) {
    const cookieHeader = await this.jar.getCookieString(url);
    const headers = {
      ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
    };
    if (cookieHeader) headers['cookie'] = cookieHeader;
    if (referer) headers['referer'] = referer;

    const res = await this.client.request({
      method,
      url,
      data: form || undefined,
      headers
    });

    // Zapisz ciasteczka z naglowka Set-Cookie odpowiedzi.
    const setCookies = res.headers['set-cookie'] || [];
    for (const c of setCookies) {
      try { await this.jar.setCookie(c, url); } catch (_) { /* zly format — ignoruj */ }
    }
    return res;
  }

  /** Czy w jarze pojawilo sie c_user (czyli sesja zalogowana)? */
  async hasCUser(baseCookieUrl) {
    try {
      const s = await this.jar.getCookieString(baseCookieUrl);
      return (s.match(/(^|;\s*)c_user=/) || []).length > 0;
    } catch (_) { return false; }
  }

  /** Ciasteczka sesyjne w formacie appstate FCA (jak z totp_login.js). */
  async appstate(baseCookieUrl) {
    const cookies = await this.jar.getCookies(baseCookieUrl);
    const now = new Date().toISOString();
    const out = [];
    for (const c of cookies) {
      if (!CORE_COOKIES.includes(c.key)) continue;
      out.push({
        key: c.key,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        hostOnly: !String(c.domain || '').startsWith('.'),
        creation: now,
        lastAccessed: now
      });
    }
    return out;
  }
}

/**
 * Finalizacja: odbierz strone glowna (wykrywa twardy checkpoint przez
 * przekierowanie na /checkpoint/<nr>), wyciagnij appstate.
 */
async function finishLogin(session, baseUrl, log) {
  let hard = null;
  try {
    const resHome = await session.request('GET', baseUrl + '/', { referer: baseUrl + '/checkpoint/' });
    const loc = resHome && resHome.headers.location ? String(resHome.headers.location) : '';
    hard = /checkpoint\/(\d+)/.exec(loc);
  } catch (_) { /* brak home — nie krytyczne, sprawdzamy appstate i tak */ }

  if (hard) {
    throw errWith('CHECKPOINT_MANUAL',
      `Twardy checkpoint FB (${hard[1]}) — konto trzeba odblokowac recznie ` +
      `zalogowujac sie raz na zwyklym urzadzeniu (telefon/PC), a potem wkleic swiezy appstate przez panel.`);
  }

  const appstate = await session.appstate(baseUrl);
  const hasCUser = appstate.some(c => c.key === 'c_user');
  const hasXs = appstate.some(c => c.key === 'xs');
  if (!hasCUser || !hasXs) {
    throw errWith('LOGIN_FAILED',
      'Logowanie HTTP nie doslo do sesji — brak kluczowych ciasteczek c_user/xs.');
  }
  log(`✅ Sukces (sciezka HTTP, bez przegladarki) — pozyskano ${appstate.length} ciasteczek appstate.`);
  return appstate;
}

/**
 * Sciana "kod z reki": pyta dostawce o 6-cyfrowy kod i wysyla go w polu
 * approvals_code formularza checkpointu.
 * Zwraca: appstate (tablica) gdy logowanie doszlo do sesji,
 * albo { passed: boolean, $: cheerio } gdy nie (passed=true znaczy, ze
 * monit kodu zniknal i mozna iśc dalej przyciskami).
 */
async function submitManualCodeRound(session, opts, $) {
  const { baseUrl, checkpointPostUrl, log, manualCodeProvider, maxCodeAttempts, totpSecret } = opts;
  const bodyText = ($('body').text() || '');
  const emailWall = /sent (a |you a |the )?code|we sent|kod (do )?(weryfikacji|potwierdzenia)/i.test(bodyText);

  let passed = false;
  for (let attempt = 1; attempt <= maxCodeAttempts && !passed; attempt++) {
    let code = null;

    if (totpSecret) {
      try {
        code = await generateTotpCode(totpSecret);
        log(`Monit 2FA — wysylam wygenerowany kod TOTP.`);
      } catch (e) {
        log(`Klucz TOTP nie zadzialal (${e.message}) — poprosze operatora o kod.`);
      }
    }

    if (!code && manualCodeProvider) {
      log(`Czekam na 6-cyfrowy ${emailWall ? 'kod z emaila/telefonu konta' : 'kod 2FA'} od operatora ` +
        `(próba ${attempt}/${maxCodeAttempts})...`);
      try {
        code = await manualCodeProvider({ attempt, context: emailWall ? 'email_code' : '2fa' });
      } catch (e) {
        log(`Brak kodu od operatora: ${e.message}`);
      }
    }

    if (!code) break;

    const formEl = $('form[method="post"][class="checkpoint"]');
    const form = formEl.length ? { ...qs.parse(formEl.serialize()) } : {};
    form.approvals_code = String(code).trim();
    const submitBtn = $('button[name="submit[Submit Code]"]');
    if (submitBtn.length) form['submit[Submit Code]'] = (submitBtn.text() || 'Submit Code').trim();

    const res = await session.request('POST', checkpointPostUrl, { form: qs.stringify(form), referer: baseUrl + '/checkpoint/' });
    if (await session.hasCUser(baseUrl)) return await finishLogin(session, baseUrl, log);

    $ = cheerio.load(String(res.data || ''));
    const stillAsks = $('#approvals_code, input[name="approvals_code"]').length > 0
      || /enter login code/i.test(($('#checkpoint_title').text() || ''));
    passed = !stillAsks;
    if (!passed) log('Kod nie zostal zaakceptowany (zly lub przeterminowany).');
  }

  return { done: false, passed, $ };
}

/**
 * Chodzenie po przyciskach checkpointu ("This was me" / "Continue") —
 * po kodzie 2FA albo przy czystym checkpointcie lokalizacyjnym.
 */
async function followCheckpointButtons(session, opts, $) {
  const { baseUrl, checkpointPostUrl, log } = opts;

  for (let step = 0; step < 6; step++) {
    if (await session.hasCUser(baseUrl)) return await finishLogin(session, baseUrl, log);

    // FB poprosil o KOLEJNY kod (np. email po 2FA) — nie mamy juz prob w tej sciance.
    if ($('#approvals_code, input[name="approvals_code"]').length) {
      throw errWith('CHECKPOINT_MANUAL',
        'Facebook poprosil o kolejny kod, ale sciezka HTTP wyczerpala proby — ' +
        'podaj kod w polu "Kod 2FA" na panelu i kliknij "Loguj ponownie".');
    }

    const formEl = $('form[method="post"][class="checkpoint"]');
    const buttons = $(formEl.length ? 'form[method="post"][class="checkpoint"] button' : 'button');
    if (!buttons.length) {
      throw errWith('CHECKPOINT_MANUAL',
        'Checkpoint bez przyciskow do klikniecia — odblokuj konto recznie (przegladarka) ' +
        'i wklej swiezy appstate przez panel.');
    }

    // Preferencja: "This/That was me", potem jakikolwiek "Continue".
    let pick = null;
    let continueEl = null;
    buttons.each((i, el) => {
      const name = ($(el).attr('name') || '');
      const text = ($(el).text() || '').trim();
      const all = name + ' ' + text;
      if (!pick && /this was me|that was me|to bylem ja|to jestem ja/i.test(all)) pick = el;
      else if (!continueEl && /continue|dalej/i.test(all)) continueEl = el;
    });
    if (!pick) pick = continueEl || buttons[0];

    const name = ($(pick).attr('name') || '').trim();
    const form = formEl.length ? { ...qs.parse(formEl.serialize()) } : {};
    delete form.approvals_code;
    if (name) form[name] = ($(pick).text() || '').trim() || name;
    if (form.name_action_selected === undefined) form.name_action_selected = 'save_device';

    const res = await session.request('POST', checkpointPostUrl, { form: qs.stringify(form), referer: baseUrl + '/checkpoint/' });
    log(`Checkpoint: wyslano przycisk "${name || '(submit)'}".`);

    if (await session.hasCUser(baseUrl)) return await finishLogin(session, baseUrl, log);
    $ = cheerio.load(String(res.data || ''));
  }

  throw errWith('CHECKPOINT_MANUAL',
    'Nie da sie automatycznie przejsc checkpointu przez HTTP — odblokuj konto recznie ' +
    '(przegladarka, najlepiej z tego samego IP/proxy) i wklej swiezy appstate przez panel.');
}

/**
 * Glowna sciana checkpointu: 2FA (kod) -> przyciski ("This was me" itd.).
 * @param session sesja HTTP (jar ciasteczek)
 * @param opts { baseUrl, log, manualCodeProvider, maxCodeAttempts, totpSecret, resBody }
 */
async function handleCheckpoint(session, opts, resBody) {
  const { baseUrl, log } = opts;
  const checkpointPostUrl = `${baseUrl}/login/checkpoint/?next=${encodeURIComponent(baseUrl + '/home.php')}&refsrc=deprecated`;
  let $ = cheerio.load(String(resBody || ''));

  const title = ($('title').text() || '');
  const bodyHead = String($('body').text() || '').slice(0, 400);
  if (/login approval needed/i.test(title) || /login approval/i.test(bodyHead)) {
    throw errWith('CHECKPOINT_MANUAL',
      'FB wymaga weryfikacji logowania na urzadzeniu, ktorego normalnie uzywasz ' +
      '("Login approval needed"). Zaloguj sie raz recznie na swoim zwyklym telefonie/komputerze.');
  }

  const ckTitle = ($('#checkpoint_title').text() || '');
  const asksCode = $('#approvals_code, input[name="approvals_code"]').length > 0
    || /enter login code/i.test(ckTitle);

  if (asksCode) {
    const r = await submitManualCodeRound(session, { ...opts, checkpointPostUrl }, $);
    if (Array.isArray(r)) return r; // appstate — logowanie doszlo do sesji
    if (!r.passed) {
      throw errWith('CHECKPOINT_MANUAL',
        'Kod 2FA / z emaila nie przeszedl weryfikacji (brak kodu, zly lub przeterminowany).');
    }
    $ = r.$;
    // Monit kodu zniknal — moze byc jeszcze "This was me" / "Continue" (lacznie z sukcesem w srodku).
    if (await session.hasCUser(baseUrl)) return await finishLogin(session, baseUrl, log);
  }

  return await followCheckpointButtons(session, { ...opts, checkpointPostUrl }, $);
}

/**
 * GLOWNE LOGOWANIE (sciezka m.facebook.com — jak w GoatBocie).
 * @returns {Promise<Array>} appstate
 * @throws err.code: WRONG_ACCOUNT | CHECKPOINT_MANUAL | LOGIN_FORM_NOT_FOUND | LOGIN_FAILED
 */
async function loginMFacebook({ email, password, options = {} }) {
  const {
    proxyUrl = null,
    totpSecret = null,
    manualCodeProvider = null,
    maxCodeAttempts = 2,
    baseUrl = 'https://m.facebook.com'
  } = options;
  const log = (m) => console.log(`[FB-HTTP] ${m}`);

  const session = new FbHttpSession({ proxyUrl });
  try { await session.jar.setCookie('locale=en_US', baseUrl); } catch (_) { /* ok */ }

  // 1) Strona logowania — pola formularza (fb_dtsg, jazoest, lsd...).
  const res1 = await session.request('GET', `${baseUrl}/login/`);
  const $1 = cheerio.load(String(res1.data || ''));
  const loginForm = $1('#login_form');
  if (!loginForm.length) {
    throw errWith('LOGIN_FORM_NOT_FOUND',
      `FB nie zwraca formularza #login_form (status ${res1.status}) — ` +
      `IP moglo zostac zablokowane albo FB zmienil strone logowania.`);
  }

  const form1 = { ...qs.parse(loginForm.serialize()) };
  delete form1.pass;
  form1.email = email;
  form1.encpass = `#PWD_BROWSER:0:${~~(Date.now() / 1000)}:${password}`;
  form1.prefill_contact_point = email;
  form1.prefill_source = 'browser_dropdown';
  form1.prefill_type = 'password';
  form1.first_prefill_source = 'browser_dropdown';
  form1.first_prefill_type = 'contact_point';
  form1.had_cp_prefilled = 'true';
  form1.had_password_prefilled = 'true';
  form1.is_smart_lock = 'false';
  form1.bi_xrwh = '0';
  form1.try_number = '0';
  form1.unrecognized_tries = '0';
  form1.bi_wvdp = BI_WVDP;

  // 2) Wyslij logowanie.
  const res2 = await session.request(
    'POST',
    `${baseUrl}/login/device-based/login/async/?refsrc=deprecated&lwv=100`,
    { form: qs.stringify(form1), referer: `${baseUrl}/login/` }
  );
  const body2 = String(res2.data || '');
  const loc2 = res2.headers.location ? String(res2.headers.location) : '';

  // Bled serwera FB (5xx) / timeout — to blad techniczny, nie checkpoint:
  // sciana loginFbHttp spróbuje jeszcze mbasic.
  if (res2.status >= 500) {
    throw errWith('LOGIN_FAILED', `FB zwrócil bled serwera ${res2.status} podczas logowania (sciana m.facebook).`);
  }
  if (body2.includes('You used an old password')) {
    throw errWith('WRONG_ACCOUNT', 'Haslo jest nieaktualne (FB: "You used an old password").');
  }
  if (
    body2.includes('m_login_notice":"Invalid username or password') ||
    body2.includes('Incorrect password.') ||
    body2.includes('href=\\"\\/recover\\/initiate') ||
    loc2.includes('m_lara_first_password_failure')
  ) {
    throw errWith('WRONG_ACCOUNT', 'Zle dane logowania (zly email lub haslo).');
  }

  // 3) Bezposredni sukces?
  if (await session.hasCUser(baseUrl)) return await finishLogin(session, baseUrl, log);

  // 4) Checkpoint — pobierz i przetworz.
  const res3 = await session.request(
    'GET',
    `${baseUrl}/checkpoint/?next=${encodeURIComponent(baseUrl + '/home.php')}&refsrc=deprecated&__req=6`,
    { referer: loc2 || `${baseUrl}/login/` }
  );
  if (await session.hasCUser(baseUrl)) return await finishLogin(session, baseUrl, log);

  return await handleCheckpoint(session,
    { baseUrl, log, manualCodeProvider, maxCodeAttempts, totpSecret },
    res3.data
  );
}

/**
 * Awaryjna sciezka mbasic.facebook.com (FB bez JavaScriptu).
 * Laczniejszy, ale mniej "przekonujacy" dla FB — wiec dopiero po m.facebook.
 */
async function loginMbasic({ email, password, options = {} }) {
  const {
    proxyUrl = null,
    totpSecret = null,
    manualCodeProvider = null,
    maxCodeAttempts = 2,
    mbasicUrl = 'https://mbasic.facebook.com'
  } = options;
  const log = (m) => console.log(`[FB-HTTP][mbasic] ${m}`);

  const session = new FbHttpSession({ proxyUrl });
  try { await session.jar.setCookie('locale=en_US', mbasicUrl); } catch (_) { /* ok */ }

  const res1 = await session.request('GET', mbasicUrl + '/');
  const $1 = cheerio.load(String(res1.data || ''));
  const formEl = $1('form').first();
  if (!formEl.length) throw errWith('LOGIN_FORM_NOT_FOUND', 'mbasic: FB nie zwraca formularza logowania.');

  const action = formEl.attr('action') || '/login/';
  const loginAction = new URL(action, mbasicUrl).href;

  const form1 = { ...qs.parse(formEl.serialize()) };
  form1.email = email;
  form1.pass = password;
  const res2 = await session.request('POST', loginAction, { form: qs.stringify(form1), referer: mbasicUrl + '/' });
  const body2 = String(res2.data || '');

  if (/incorrect password|invalid (username|password)|blad logowania/i.test(body2)) {
    throw errWith('WRONG_ACCOUNT', 'Zle dane logowania (mbasic).');
  }
  if (await session.hasCUser(mbasicUrl)) return await finishLogin(session, mbasicUrl, log);

  // Checkpoint na mbasic — wstrzymujemy sie na URL-u /checkpoint/...
  const $2 = cheerio.load(body2);
  let $ = $2;
  if (!$2('form').length) {
    const res3 = await session.request('GET', String(res2.headers.location || mbasicUrl + '/checkpoint/'), { referer: loginAction });
    if (await session.hasCUser(mbasicUrl)) return await finishLogin(session, mbasicUrl, log);
    $ = cheerio.load(String(res3.data || ''));
  }

  const checkpointPostUrl = (() => {
    const el = $('form').first();
    return el.attr('action') ? new URL(el.attr('action'), mbasicUrl).href : mbasicUrl + '/checkpoint/';
  })();

  const opts = {
    baseUrl: mbasicUrl,
    checkpointPostUrl,
    log,
    manualCodeProvider,
    maxCodeAttempts,
    totpSecret,
    resBody: $
  };

  if ($('#approvals_code, input[name="approvals_code"]').length) {
    const r = await submitManualCodeRound(session, opts, $);
    if (Array.isArray(r)) return r; // appstate
    if (!r.passed) throw errWith('CHECKPOINT_MANUAL', 'Kod 2FA / z emaila nie przeszedl weryfikacji (sciana mbasic).');
    $ = r.$;
    if (await session.hasCUser(mbasicUrl)) return await finishLogin(session, mbasicUrl, log);
  }
  return await followCheckpointButtons(session, opts, $);
}

/**
 * Logowanie FB bez przegladarki: najpierw m.facebook.com, potem (tylko przy
 * bledach technicznych) mbasic.facebook.com.
 */
async function loginFbHttp(email, password, options = {}) {
  let mErr = null;
  try {
    return await loginMFacebook({ email, password, options });
  } catch (err) {
    mErr = err;
    if (err && (err.code === 'WRONG_ACCOUNT' || err.code === 'CHECKPOINT_MANUAL')) throw err;
    console.log(`[FB-HTTP] Sciezka m.facebook nie zadzialala (${err.message}) — proba mbasic.facebook.com...`);
  }
  try {
    return await loginMbasic({ email, password, options });
  } catch (err2) {
    if (err2 && err2.code === 'WRONG_ACCOUNT') throw err2;
    // Oba bledy techniczne — pokaz pierwszy, dokladniejszy.
    err2.httpErrorChain = [mErr && mErr.message, err2.message].filter(Boolean);
    throw err2;
  }
}

/**
 * Logowanie z fallbackiem: najpierw sciezka HTTP (szybka, odporna na
 * zmienne selektory), a jak padnie z bledem technicznym — Puppeteer.
 * Blady WRONG_ACCOUNT i CHECKPOINT_MANUAL NIE ida do fallbacku
 * (przegladarka z tymi samymi danymi i tak by odmowila / znowu stanela na scianie).
 *
 * Podpis jak loginWithTotp z totp_login.js — zwraca appstate.
 */
async function loginWithHttpFirst(email, password, totpSecret = null, proxyUrl = null, options = {}) {
  const { allowPuppeteerFallback = true, ...rest } = options;
  try {
    return await loginFbHttp(email, password, { ...rest, totpSecret, proxyUrl });
  } catch (err) {
    if (err && err.code === 'WRONG_ACCOUNT') throw err;
    if (!allowPuppeteerFallback) throw err;
    // CHECKPOINT_MANUAL: probujemy jeszcze przegladarka (ma szanse przy monicie 2FA),
    // ale jesli sciana to twardy checkpoint — i tak wrzuci bled, panel pokaze "loguj ponownie".
    console.log(`[FB-LOGIN] Sciezka HTTP: ${err.message} — proba przez przegladarke (Puppeteer)...`);
    const { loginWithTotp } = require('./totp_login');
    return await loginWithTotp(email, password, totpSecret, proxyUrl, rest);
  }
}

module.exports = { loginFbHttp, loginWithHttpFirst, loginMFacebook, loginMbasic };
