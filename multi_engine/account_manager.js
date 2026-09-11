/**
 * Resilient Account Manager & Multi-Instance Runner
 * Obsluguje start, restarty i izolacje wielu sesji bota.
 * Wypadniecie jednego konta nie wplywa na dzialanie pozostalych.
 *
 * STRATEGIA LOGOWAN BEZPOWIEDCZNA WOBEM CHECKPOINTOW (Etap 1):
 * - Konta loguja sie wedlug login_slot z bazy (w rozsypce czasu), a NIE szturmem przy starcie.
 *   Przy starcie: pierwszych kilka od razu (z przerwa 1-3 min miedzy nimi),
 *   reszta rozklada sie na kolejne ~48h.
 * - Po bledzie checkpoint/2FA: BRAK szybkich retry. Pauza 1h, maks. 3 probe dziennie,
 *   a potem czekanie do 08:00 nastepnego dnia (czas polski).
 * - Jesli konto ma dane logowania (email+password), przy checkpointach i przy
 *   odswiezaniu starej sesji probujemy najpierw logowania przez Puppeteer
 *   (loginWithTotp) — realna przegladarka, która umie obslugowac kod 2FA i
 *   potwierdzenie "To bylem ja".
 * - Po udanym logowaniu login_slot przesuwa sie 3-7 dni do przodu
 *   (odswiezanie sesji "w rozsypce", zawsze z tego samego IP konta).
 * - System zdarzen (onEvent) — podkarmia panel webowy i powiadomienia do
 *   grupy adminow (checkpoint, login_failed, online, ...).
 */

const login = require('@dongdev/fca-unofficial');
const { HttpsProxyAgent } = require('https-proxy-agent');
const commandRegistry = require('./command_registry');
const messageQueueManager = require('./message_queue');
const threadRouter = require('./thread_router');
const {
  updateAccountAppstate,
  updateAccountStatus,
  updateAccountLoginMeta,
  getAccount
} = require('./db');
const { loginWithTotp } = require('./totp_login');
const { renderPayloadToText } = require('../utils/messenger');
const manualCodeInbox = require('./manual_codes');

// ============ Parametry logowania (mozna nadpisac env) ============
const LOGIN_POLICY = {
  MAX_IMMEDIATE_ON_BOOT: parseInt(process.env.MULTI_MAX_IMMEDIATE || '3', 10),
  FIRST_SPREAD_FROM_MS: 6 * 3600e3,            // "pozniejsze" konta: slot najwczelej +6h
  FIRST_SPREAD_TO_MS: 48 * 3600e3,             // ... i najpозniej +48h
  LOGIN_STAGGER_MIN_MS: parseInt(process.env.LOGIN_STAGGER_MIN_MS || '60000', 10),
  LOGIN_STAGGER_MAX_MS: parseInt(process.env.LOGIN_STAGGER_MAX_MS || '180000', 10),
  SCHEDULER_INTERVAL_MS: parseInt(process.env.SCHEDULER_INTERVAL_MS || '900000', 10), // 15 min
  PUPPETEER_RETRY_DELAY_MS: parseInt(process.env.PUPPETEER_RETRY_DELAY_MS || '15000', 10),
  MANUAL_CODE_TIMEOUT_MS: parseInt(process.env.MANUAL_CODE_TIMEOUT_MS || '180000', 10), // 3 min na kod od czlowieka
  CHECKPOINT_RETRY_MS: parseInt(process.env.CHECKPOINT_RETRY_MS || '3600000', 10),  // 1h
  CHECKPOINT_MAX_PER_DAY: parseInt(process.env.CHECKPOINT_MAX_PER_DAY || '3', 10),
  PUPPETEER_FAIL_PAUSE_MS: parseInt(process.env.PUPPETEER_FAIL_PAUSE_MS || '1800000', 10), // 30 min
  NO_APPSTATE_PAUSE_MS: 60 * 60e3,             // brak appstate i kredyansow — pauza 1h
  REFRESH_MIN_DAYS: 3,                         // po udanym logowaniu: kolejny slot za min. 3 dni
  REFRESH_MAX_DAYS: 7,                         // ... i max. 7 dni
  FAST_RETRY_MAX: 6,                           // szybkie retry (backoff) przed dluga pauza
  FAST_RETRY_MAX_DELAY_MS: 15 * 60e3           // dluga pauza po wyczerpaniu szybkich retry: 15 min
};

function polandDayKey(d = new Date()) {
  try {
    return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }); // YYYY-MM-DD
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

// Konwersja checkpoint_day z bazy (string ISO albo Date z PG) na klucz dnia PL
function dayKeyOf(value) {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    return polandDayKey(d);
  } catch (_) {
    return null;
  }
}

// Ile ms do najblizszego 08:00 (czas polski)
function msUntilPoland08() {
  const now = new Date();
  try {
    const plNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
    const target = new Date(plNow);
    target.setHours(8, 0, 0, 0);
    if (target.getTime() <= plNow.getTime()) target.setDate(target.getDate() + 1);
    return target.getTime() - plNow.getTime();
  } catch (_) {
    return 12 * 3600e3;
  }
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isCheckpointish(errLike) {
  const s = String(errLike && (errLike.error || errLike.message) || errLike || '');
  return /checkpoint|login_approval|approvals|two.?factor|\b2fa\b|identity verif|unusual activit|to by[\u0142l]em|zwykla czynno|weryfikac/i.test(s);
}

class AccountInstance {
  constructor(accountData, globalConfig = {}) {
    this.account = accountData;
    this.config = globalConfig;
    this.api = null;
    this.listener = null;
    this.status = 'IDLE'; // IDLE, CONNECTING, ONLINE, RECONNECTING, RETRY_WAIT, CHECKPOINT, ERROR
    this.retryCount = 0;
    this.reconnectTimer = null;
    this.cooldownTimer = null;
    this.puppeteerTriedThisCycle = false;
    this._emitFn = null;
  }

  setEmitter(fn) {
    this._emitFn = fn;
  }

  _emit(name, message, details = {}) {
    if (typeof this._emitFn !== 'function') return;
    const evt = {
      ts: new Date().toISOString(),
      name,
      accountId: this.account.id,
      email: this.account.email,
      message,
      details: details || {}
    };
    try { this._emitFn(evt); } catch (_) { /* eventy nie moga zabic bota */ }
  }

  hasCredentials() {
    return !!(this.account && this.account.email && this.account.password);
  }

  _clearTimers() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.cooldownTimer) { clearTimeout(this.cooldownTimer); this.cooldownTimer = null; }
  }

  /**
   * Logowanie konta.
   * options.forcePuppeteer = true wymusza sciezke przegladarkowa (onboarding/odzyskiwanie)
   */
  start(options = {}) {
    const forcePuppeteer = !!options.forcePuppeteer;
    if (this.status === 'ONLINE' || this.status === 'CONNECTING') {
      return Promise.resolve();
    }

    this._clearTimers();
    this.status = 'CONNECTING';

    // Brak appstate i brak kredyansow — nie ma czym sie zalogowac
    if (!this.account.appstate && !this.hasCredentials()) {
      this.status = 'RETRY_WAIT';
      this._emit('login_failed',
        `Konto ${this.account.email} (id ${this.account.id}): brak appstate i brak danego logowania. Wklej appstate przez panel (POST /api/accounts/${this.account.id}/appstate).`);
      this._scheduleLongRetry(LOGIN_POLICY.NO_APPSTATE_PAUSE_MS, 'no_appstate');
      return Promise.resolve();
    }

    // Czy odswiezyc sesje przez realna przegladarke (zawsze z proxy tego konta)?
    const lastLogin = this.account.last_login_at ? Date.parse(this.account.last_login_at) : 0;
    const refreshDue = lastLogin > 0 && (Date.now() - lastLogin) > LOGIN_POLICY.REFRESH_MAX_DAYS * 86400e3;
    const usePuppeteer = this.hasCredentials() &&
      (forcePuppeteer || !this.account.appstate || refreshDue);

    const doFcaLogin = () => new Promise((resolve) => {
      const loginOptions = {
        appState: this.account.appstate,
        listenEvents: true,
        logLevel: 'silent', // Wyciszenie spamu FCA w konsoli
        forceLogin: true
      };

      if (this.account.proxy_url) {
        try {
          loginOptions.httpAgent = new HttpsProxyAgent(this.account.proxy_url);
          console.log(`[BOT #${this.account.id}] Uzywam proxy: ${this.account.proxy_url.replace(/:[^:]*@/, ':***@')}`);
        } catch (e) {
          console.error(`[BOT #${this.account.id}] Blad konfiguracji proxy:`, e.message);
        }
      }

      login(loginOptions, async (err, api) => {
        if (err) {
          const errStr = String(err.error || err.message || err);
          if (isCheckpointish(errStr)) {
            this._onCheckpointError(errStr, { afterPuppeteer: false });
            return resolve();
          }
          // zwykly bled (siec, FB zajete) — szybki backoff, ale z limitem
          this._scheduleReconnect();
          return resolve();
        }

        // ===== SUKCES =====
        this.api = api;
        this.status = 'ONLINE';
        this.retryCount = 0;
        this.puppeteerTriedThisCycle = false;
        console.log(`[BOT #${this.account.id}] 🚀 Zalogowano pomyslnie jako FB ID: ${api.getCurrentUserID()}`);

        try {
          const freshState = api.getAppState();
          if (freshState) {
            this.account.appstate = freshState;
            await updateAccountAppstate(this.account.id, freshState);
          }
          // Przesun kolejny slot logowania 3-7 dni do przodu (odswiezanie w rozsypce)
          const nextSlot = new Date(
            Date.now() + randomBetween(LOGIN_POLICY.REFRESH_MIN_DAYS, LOGIN_POLICY.REFRESH_MAX_DAYS) * 86400e3
          ).toISOString();
          this.account.login_slot = nextSlot;
          this.account.last_login_at = new Date().toISOString();
          await updateAccountLoginMeta(this.account.id, {
            login_slot: nextSlot,
            checkpoint_day: polandDayKey(),
            checkpoint_attempts: 0
          });
          await updateAccountStatus(this.account.id, 'active');
        } catch (metaErr) {
          console.error(`[BOT #${this.account.id}] Blad zapisu metadanych po logowaniu:`, metaErr.message);
        }

        // Podepnij kolejke wiadomosci do API instancji
        const queue = messageQueueManager.get(this.account.id);
        api.sendMessageQueued = (msg, tId, replyId) => queue.enqueue(api, msg, tId, replyId);

        this._listen(api);
        this._emit('online', `Konto ${this.account.email} (id ${this.account.id}) jest ONLINE.`);
        resolve();
      });
    });

    if (!usePuppeteer) {
      return doFcaLogin();
    }

    // ===== Sciezka przegladarkowa (onboarding / odswiezanie / odzyskiwanie) =====
    this.puppeteerTriedThisCycle = true;
    this._emit('onboarding',
      `Konto ${this.account.email} (id ${this.account.id}): logowanie przez przegladarke (Puppeteer, proxy konta)...`);

    // Dostawca kodu "z reki": gdy przegladarka stoi na monicie 2FA / kodzie
    // z emaila, logowanie czeka, a operator podaje kod w panelu
    // (POST /api/accounts/:id/2fa-code) albo w konsoli.
    const manualCodeProvider = async ({ attempt, context } = {}) => {
      const kind = context === 'email_code' ? 'kod z emaila/telefonu konta' : 'kod 2FA z aplikacji';
      this._emit('waiting_2fa_code',
        `Konto ${this.account.email} (id ${this.account.id}): czekam na 6-cyfrowy ${kind} (próba ${attempt || 1}). Podaj go w panelu: POST /api/accounts/${this.account.id}/2fa-code`);
      return manualCodeInbox.awaitManualCode(this.account.id, {
        timeoutMs: LOGIN_POLICY.MANUAL_CODE_TIMEOUT_MS,
        label: this.account.email
      });
    };

    return (async () => {
      let appstate;
      try {
        appstate = await loginWithTotp(
          this.account.email,
          this.account.password,
          this.account.totp_secret || null,
          this.account.proxy_url || null,
          { manualCodeProvider, maxCodeAttempts: 2 }
        );
      } catch (pErr) {
        const manual = pErr && pErr.code === 'CHECKPOINT_MANUAL';
        const checkpointLike = isCheckpointish(pErr);
        if (manual || checkpointLike) {
          // FB zadal kod z emaila/telefonu albo inny checkpoint — tylko reczna interwencja
          this.puppeteerTriedThisCycle = 'manual_wall';
          this._onCheckpointError(String(pErr.message || pErr), { afterPuppeteer: true });
          return;
        }
        // inny blad techniczny przegladarki (brak Chromium, proxy martwy...)
        console.error(`[BOT #${this.account.id}] Blad logowania Puppeteer:`, pErr.message);
        this._emit('login_failed',
          `Konto ${this.account.email}: blad techniczny logowania przegladarkowego (${pErr.message}). Pauza ${Math.round(LOGIN_POLICY.PUPPETEER_FAIL_PAUSE_MS / 60000)} min.`);
        this._scheduleLongRetry(LOGIN_POLICY.PUPPETEER_FAIL_PAUSE_MS, 'puppeteer_failed');
        return;
      }

      // Swiezy appstate z przegladarki — zapisz i idz na fca
      this.account.appstate = appstate;
      this.puppeteerTriedThisCycle = false;
      try {
        await updateAccountAppstate(this.account.id, appstate);
      } catch (_) { /* zapiszemy ponownie po udanym logowaniu fca */ }
      await doFcaLogin();
    })();
  }

  /**
   * Checkpoint/2FA: ZANICZENIE szybkich retry, proba przez przegladarke (raz),
   * a potem dluga pauza z limitem prob dziennie.
   */
  async _onCheckpointError(errLike, { afterPuppeteer = false } = {}) {
    this.status = 'CHECKPOINT';
    this.retryCount = 0;
    const errStr = String(errLike && (errLike.error || errLike.message) || errLike || '');

    try { await updateAccountStatus(this.account.id, 'checkpoint'); } catch (_) { /* ignore */ }

    this._emit('checkpoint',
      `⚠️ Konto ${this.account.email} (id ${this.account.id}) — checkpoint Facebooka (nowa lokalizacja / 2FA). Logowanie wstrzymane, szybkie retry wylaczone.`,
      { error: errStr.slice(0, 300), afterPuppeteer });

    // Licznik prob checkpointu na dzis (czas PL) — przetrwa restarty (baza).
    // Zliczany ZAWSZE, takze gdy za chwile probujemy jeszcze Puppeteera.
    const today = polandDayKey();
    const prevDay = dayKeyOf(this.account.checkpoint_day);
    const attempts = (prevDay === today) ? (this.account.checkpoint_attempts || 0) + 1 : 1;
    this.account.checkpoint_day = today;
    this.account.checkpoint_attempts = attempts;
    const capReached = attempts >= LOGIN_POLICY.CHECKPOINT_MAX_PER_DAY;

    // Jedyna szansa auto: realna przegladarka z kodem TOTP (gdy konto ma kredyansy
    // i nie wyczerpamy jeszcze dziennego limitu prob)
    if (!afterPuppeteer && this.puppeteerTriedThisCycle !== true && this.hasCredentials() && !capReached) {
      // Zapisz postep + konserwatywny slot (1h), zebym po ewentualnym zgonie
      // procesu nie probowal sie zalogowac od rzedu
      const conservativeSlot = new Date(Date.now() + LOGIN_POLICY.CHECKPOINT_RETRY_MS).toISOString();
      this.account.login_slot = conservativeSlot;
      try {
        await updateAccountLoginMeta(this.account.id, {
          checkpoint_day: today,
          checkpoint_attempts: attempts,
          login_slot: conservativeSlot
        });
      } catch (_) { /* ignore */ }
      this.puppeteerTriedThisCycle = true;
      this.cooldownTimer = setTimeout(() => {
        this.cooldownTimer = null;
        this.start({ forcePuppeteer: true }).catch(() => {});
      }, LOGIN_POLICY.PUPPETEER_RETRY_DELAY_MS);
      return;
    }

    let delay = LOGIN_POLICY.CHECKPOINT_RETRY_MS;
    if (capReached) {
      delay = msUntilPoland08();
      this._emit('checkpoint_blocked',
        `Konto ${this.account.email}: wyczerpane ${LOGIN_POLICY.CHECKPOINT_MAX_PER_DAY} dzienne proby checkpointu. Czekam do 08:00 (PL).`, {});
    }

    const nextSlot = new Date(Date.now() + delay).toISOString();
    this.account.login_slot = nextSlot;
    try {
      await updateAccountLoginMeta(this.account.id, {
        login_slot: nextSlot,
        checkpoint_day: today,
        checkpoint_attempts: attempts
      });
    } catch (_) { /* ignore */ }

    this._scheduleLongRetry(delay, 'checkpoint');
  }

  /**
   * Długa pauza (checkpoint / technika) — zamiast szybkiego bombardowania FB.
   */
  _scheduleLongRetry(delayMs, reason) {
    this.status = 'RETRY_WAIT';
    this._clearTimers();
    const minutes = Math.max(1, Math.round(delayMs / 60000));
    console.log(`[BOT #${this.account.id}] ⏸ Długa pauza ${minutes} min (powód: ${reason}). Nastepna próba: ${new Date(Date.now() + delayMs).toLocaleString('pl-PL')}`);
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      this.puppeteerTriedThisCycle = false;
      this.start().catch(() => {});
    }, delayMs);
  }

  /**
   * Szybki backoff dla bledow sieciowych — z limitem, po nim dluga pauza.
   */
  _scheduleReconnect() {
    this.retryCount++;
    if (this.retryCount >= LOGIN_POLICY.FAST_RETRY_MAX) {
      this._emit('login_failed',
        `Konto ${this.account.email}: ${this.retryCount} szybkie nieudane logowania pod rzed. Pauza ${Math.round(LOGIN_POLICY.FAST_RETRY_MAX_DELAY_MS / 60000)} min.`,
        { retries: this.retryCount });
      this.retryCount = 0;
      this._scheduleLongRetry(LOGIN_POLICY.FAST_RETRY_MAX_DELAY_MS, 'fast_retries_exhausted');
      return;
    }
    const delay = Math.min(5000 * Math.pow(2, this.retryCount - 1), 120000);
    this.status = 'RECONNECTING';
    console.log(`[BOT #${this.account.id}] Ponowna proba polaczenia za ${Math.round(delay / 1000)}s (proba #${this.retryCount})...`);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start().catch(() => {});
    }, delay);
  }

  _listen(api) {
    try {
      this.listener = api.listenMqtt((err, event) => {
        if (err) {
          console.error(`[BOT #${this.account.id}] Blad listenMqtt:`, err.message || err);
          this.stop();
          this._scheduleReconnect();
          return;
        }

        this._handleEvent(api, event).catch(e => {
          console.error(`[BOT #${this.account.id}] Blad w obsludze zdarzenia:`, e.message);
        });
      });
    } catch (e) {
      console.error(`[BOT #${this.account.id}] Nie udalo sie wystartowac listenMqtt:`, e.message);
      this._scheduleReconnect();
    }
  }

  async _handleEvent(api, event) {
    if (!event || !['message', 'message_reply'].includes(event.type) || !event.body) {
      return;
    }

    const threadId = String(event.threadID || '');
    const senderId = String(event.senderID || '');
    const botId = String(api.getCurrentUserID() || '');

    // Ignoruj wlasne wiadomosci
    if (senderId === botId) return;

    // 1. Zabezpieczenie przed podwojnym odpowiadaniem na tej samej grupie
    if (event.isGroup && !threadRouter.canHandle(threadId, this.account.id)) {
      return; // Inny bot z naszego klastra juz obsluguje te grupe
    }

    // 2. Prefiks i rozpoznawanie komend
    const prefix = '!';
    const body = event.body.trim();
    if (!body.startsWith(prefix)) return;

    const args = body.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    // 3. Pobierz komende ze wspoldzielonego rejestru (0 alokacji w pamieci)
    const command = commandRegistry.get(commandName);
    if (!command) return;

    const clientStub = {
      api,
      accountId: this.account.id,
      botId,
      // Komendy okresowo korzystaja z cache nazw i kolejki — dajemy bezpieczne domysly
      userNames: new Map(),
      pendingBails: new Map(),
      recentMessages: [],
      activeThreadIds: new Set()
    };

    // Kontekst wiadomosci zgodny z shapem self_bot (komendy uzywaja:
    // message.author, message.mentions.users.first(), message.guild.id,
    // message.content, message.rawEvent, message.mentionedIds, message.reply(...))
    const mentionedIds = Object.keys(event.mentions || {});
    const messageContext = {
      client: clientStub,
      prefix,
      author: {
        id: senderId,
        username: event.senderName || '',
        profile: { name: event.senderName || '' }
      },
      content: body,
      body: body, // alias — czesc komend moze czytac body
      threadID: threadId,
      threadId: threadId,
      isGroup: !!event.isGroup,
      guild: { id: threadId },
      messageID: event.messageID,
      rawEvent: event,
      mentionedIds,
      attachments: event.attachments || [],
      messageReply: event.messageReply || null,
      mentions: {
        users: {
          first: () => {
            const mid = mentionedIds[0];
            if (!mid) return null;
            const mName = String((event.mentions && event.mentions[mid]) || '').replace(/^@/, '');
            return { id: mid, username: mName, profile: { name: mName } };
          }
        }
      },
      reply: (payload) => {
        const text = renderPayloadToText(payload);
        if (!text) return Promise.resolve(null);
        return api.sendMessageQueued(text, threadId, event.messageID);
      }
    };

    try {
      await command.execute(clientStub, messageContext, args);
    } catch (cmdErr) {
      console.error(`[BOT #${this.account.id}] Blad wykonania komendy ${commandName}:`, cmdErr.message);
    }
  }

  stop() {
    this.status = 'IDLE';
    this._clearTimers();
    if (this.listener && typeof this.listener.stopListening === 'function') {
      try { this.listener.stopListening(); } catch (_) { /* ignore */ }
    }
    this.listener = null;
    this.api = null;
    messageQueueManager.remove(this.account.id);
  }
}

class AccountManager {
  constructor() {
    this.instances = new Map(); // accountId -> AccountInstance
    this._eventListeners = [];
    this.schedulerTimer = null;
  }

  /** Panel/webhook podwiesza tu nasluchiwacze zdarzen kont. */
  onEvent(fn) {
    if (typeof fn === 'function') this._eventListeners.push(fn);
  }

  _dispatchEvent(evt) {
    for (const fn of this._eventListeners) {
      try { fn(evt); } catch (e) { console.error('[ACCOUNT-MGR] Blad w nasluchiwaczu zdarzen:', e.message); }
    }
  }

  register(accountData) {
    const key = Number(accountData.id);
    if (this.instances.has(key)) return this.instances.get(key);
    const instance = new AccountInstance(accountData);
    instance.setEmitter((evt) => this._dispatchEvent(evt));
    this.instances.set(key, instance);
    return instance;
  }

  _getInstance(id) {
    return this.instances.get(Number(id)) || null;
  }

  /**
   * Start klastra — konta loguja sie wedlug login_slot (w rozsypce),
   * a nie szturmem. Konta bez slotu dostaja go teraz:
   * pierwszych MAX_IMMEDIATE_ON_BOOT od razu, reszta na +6..48h.
   */
  async startAll(accounts) {
    console.log(`[ACCOUNT-MGR] Start ${accounts.length} kont (strategia checkpoint-safe: logowania w rozsypce wedlug login_slot)...`);
    const now = Date.now();
    let immediateCount = 0;

    for (const acc of accounts) {
      const instance = this.register(acc);

      // 1) Pierwotne przydzialy slotow (tylko gdy konta nie maja jeszcze slotu)
      if (!acc.login_slot) {
        let slot;
        if (immediateCount < LOGIN_POLICY.MAX_IMMEDIATE_ON_BOOT) {
          slot = new Date(now).toISOString();
          immediateCount++;
        } else {
          const spread = randomBetween(LOGIN_POLICY.FIRST_SPREAD_FROM_MS, LOGIN_POLICY.FIRST_SPREAD_TO_MS);
          slot = new Date(now + spread).toISOString();
        }
        acc.login_slot = slot;
        try { await updateAccountLoginMeta(acc.id, { login_slot: slot }); } catch (_) { /* ignore */ }
      }

      const slotMs = Date.parse(acc.login_slot);
      if (slotMs <= now) {
        // 2) Slot nadszedl — loguj, a potem przerwa 1-3 min przed nastepnym kontem
        await instance.start().catch(e =>
          console.error(`[ACCOUNT-MGR] Blad startu konta #${acc.id}:`, e.message));
        const stagger = randomBetween(LOGIN_POLICY.LOGIN_STAGGER_MIN_MS, LOGIN_POLICY.LOGIN_STAGGER_MAX_MS);
        console.log(`[ACCOUNT-MGR] Przerwa anti-szturm: ${Math.round(stagger / 1000)}s przed nastepnym logowaniem.`);
        await sleep(stagger);
      } else {
        console.log(`[ACCOUNT-MGR] Konto #${acc.id} (${acc.email}) czeka — slot logowania: ${new Date(slotMs).toLocaleString('pl-PL')} (PL).`);
      }
    }

    this._startScheduler();
  }

  /**
   * Rejestruje konto i loguje je od razu (dla panelu: dodano konto → onboarding).
   */
  async registerAndStart(accountData) {
    const instance = this.register(accountData);
    if (!instance.account.login_slot) {
      instance.account.login_slot = new Date().toISOString();
    }
    await instance.start().catch(e =>
      console.error(`[ACCOUNT-MGR] Blad startu konta #${accountData.id}:`, e.message));
    return instance;
  }

  /** Scheduler: co 15 min sprawdza sloty kont, ktore nie sa ONLINE. */
  _startScheduler() {
    if (this.schedulerTimer) return;
    this.schedulerTimer = setInterval(() => {
      this._tick().catch(e => console.error('[SCHEDULER] Blad ticka:', e.message));
    }, LOGIN_POLICY.SCHEDULER_INTERVAL_MS);
    console.log(`[SCHEDULER] Harmonogram logowan aktywny (co ${LOGIN_POLICY.SCHEDULER_INTERVAL_MS / 60000} min).`);
  }

  async _tick() {
    const now = Date.now();
    for (const instance of this.instances.values()) {
      if (['ONLINE', 'CONNECTING', 'RECONNECTING', 'RETRY_WAIT', 'CHECKPOINT'].includes(instance.status)) continue;
      const slotMs = instance.account.login_slot ? Date.parse(instance.account.login_slot) : now;
      if (slotMs > now) continue;

      console.log(`[SCHEDULER] Slot logowania konta #${instance.account.id} (${instance.account.email}) nadszedl — probuje polaczenia.`);
      instance.puppeteerTriedThisCycle = false;
      instance.start().catch(e =>
        console.error(`[SCHEDULER] Blad startu konta #${instance.account.id}:`, e.message));
    }
  }

  /**
   * Panel: reczny restart logowania konta (np. po odblokowaniu checkpointu).
   */
  async startAccountById(id, options = {}) {
    let instance = this._getInstance(id);
    if (!instance) {
      const acc = await getAccount(id);
      if (!acc) return { ok: false, error: 'Nie znaleziono konta o tym id.' };
      this.register(acc);
      instance = this._getInstance(id);
    }
    if (!instance) return { ok: false, error: 'Nie znaleziono konta o tym id.' };
    if (instance.status === 'ONLINE') return { ok: false, error: 'Konto jest juz online.' };

    instance.status = 'IDLE';
    instance.retryCount = 0;
    instance.puppeteerTriedThisCycle = false;
    const nowIso = new Date().toISOString();
    instance.account.login_slot = nowIso;
    try { await updateAccountLoginMeta(instance.account.id, { login_slot: nowIso }); } catch (_) { /* ignore */ }

    await instance.start(options);
    return { ok: true, status: instance.status, email: instance.account.email };
  }

  /**
   * Panel: wklejenie swiezego appstate (po recznym przejściu checkpointu
   * w przegladarce z proxy konta) — konto wznawia logowanie od razu.
   */
  async setAppStateById(id, appstate) {
    if (!Array.isArray(appstate) || appstate.length === 0) {
      return { ok: false, error: 'appstate musi byc niepusta tablica ciasteczek.' };
    }
    await updateAccountAppstate(id, appstate);

    const instance = this._getInstance(id);
    if (instance) {
      instance.account.appstate = appstate;
      instance.puppeteerTriedThisCycle = false;
      if (instance.status === 'ONLINE' || instance.status === 'CONNECTING') {
        instance.stop();
      }
      instance.status = 'IDLE';
      instance.retryCount = 0;
      await instance.start();
    }
    return { ok: true, status: instance ? instance.status : 'queued' };
  }

  /** API instancji ONLINE — do powiadomien (np. do grupy adminow). */
  getOnlineApis() {
    const list = [];
    for (const [id, inst] of this.instances) {
      if (inst.status === 'ONLINE' && inst.api) list.push({ id, api: inst.api });
    }
    return list;
  }

  stopAll() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    for (const inst of this.instances.values()) {
      inst.stop();
    }
    this.instances.clear();
  }

  getStatus() {
    const list = [];
    const today = polandDayKey();
    for (const [id, inst] of this.instances) {
      list.push({
        id: inst.account.id,
        email: inst.account.email,
        status: inst.status,
        retries: inst.retryCount,
        hasProxy: !!inst.account.proxy_url,
        hasCredentials: inst.hasCredentials(),
        login_slot: inst.account.login_slot || null,
        last_login_at: inst.account.last_login_at || null,
        waiting_2fa_code: manualCodeInbox.hasPending(inst.account.id),
        checkpoint_attempts_today: dayKeyOf(inst.account.checkpoint_day) === today
          ? (inst.account.checkpoint_attempts || 0)
          : 0
      });
    }
    return list;
  }
}

module.exports = new AccountManager();
