/**
 * Resilient Account Manager & Multi-Instance Runner
 * Obsluguje start, restarty i izolacje wielu sesji bota.
 * Wypadniecie jednego konta nie wplywa na dzialanie pozostalych.
 */

const login = require('@dongdev/fca-unofficial');
const { HttpsProxyAgent } = require('https-proxy-agent');
const commandRegistry = require('./command_registry');
const messageQueueManager = require('./message_queue');
const threadRouter = require('./thread_router');
const { updateAccountAppstate, updateAccountStatus } = require('./db');

class AccountInstance {
  constructor(accountData, globalConfig = {}) {
    this.account = accountData;
    this.config = globalConfig;
    this.api = null;
    this.listener = null;
    this.status = 'IDLE'; // IDLE, CONNECTING, ONLINE, RECONNECTING, ERROR, CHECKPOINT
    this.retryCount = 0;
    this.reconnectTimer = null;
  }

  async start() {
    if (this.status === 'ONLINE' || this.status === 'CONNECTING') return;
    this.status = 'CONNECTING';

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
        this.status = 'ERROR';
        console.error(`[BOT #${this.account.id}] Blad logowania (${err.error || err.message || err})`);
        
        // Wykrycie checkpointa FB
        const errStr = String(err.error || err.message || err);
        if (errStr.includes('checkpoint') || errStr.includes('login_approval')) {
          this.status = 'CHECKPOINT';
          await updateAccountStatus(this.account.id, 'checkpoint').catch(() => {});
          console.error(`[BOT #${this.account.id}] 🚨 KONTO WYMAGA WERYFIKACJI (CHECKPOINT)! Wstrzymuje.`);
          return;
        }

        this._scheduleReconnect();
        return;
      }

      this.api = api;
      this.status = 'ONLINE';
      this.retryCount = 0;
      console.log(`[BOT #${this.account.id}] 🚀 Zalogowano pomyslnie jako FB ID: ${api.getCurrentUserID()}`);

      // Zapisz odswiezone cookies w bazie
      try {
        const freshState = api.getAppState();
        await updateAccountAppstate(this.account.id, freshState);
      } catch (_) {}

      // Podepnij kolejke wiadomosci do API instancji
      const queue = messageQueueManager.get(this.account.id);
      api.sendMessageQueued = (msg, tId, replyId) => queue.enqueue(api, msg, tId, replyId);

      this._listen(api);
    });
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

    // 4. Stworz lekki kontekst wiadomosci
    const messageContext = {
      body: event.body,
      threadID: threadId,
      messageID: event.messageID,
      author: { id: senderId },
      isGroup: !!event.isGroup,
      reply: (content) => api.sendMessageQueued(content, threadId, event.messageID)
    };

    const clientStub = {
      api,
      accountId: this.account.id,
      botId
    };

    try {
      await command.execute(clientStub, messageContext, args);
    } catch (cmdErr) {
      console.error(`[BOT #${this.account.id}] Blad wykonania komendy ${commandName}:`, cmdErr.message);
    }
  }

  _scheduleReconnect() {
    this.retryCount++;
    // Exponential backoff: 5s, 10s, 20s, 40s, max 3 minuty
    const delay = Math.min(5000 * Math.pow(2, this.retryCount - 1), 180000);
    console.log(`[BOT #${this.account.id}] Ponowna proba polaczenia za ${Math.round(delay / 1000)}s (proba #${this.retryCount})...`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.start();
    }, delay);
  }

  stop() {
    this.status = 'IDLE';
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.listener && typeof this.listener.stopListening === 'function') {
      try { this.listener.stopListening(); } catch (_) {}
    }
    this.listener = null;
    this.api = null;
    messageQueueManager.remove(this.account.id);
  }
}

class AccountManager {
  constructor() {
    this.instances = new Map(); // accountId -> AccountInstance
  }

  async registerAndStart(accountData) {
    if (this.instances.has(accountData.id)) {
      console.log(`[ACCOUNT-MGR] Konto #${accountData.id} juz zarejestrowane.`);
      return;
    }

    const instance = new AccountInstance(accountData);
    this.instances.set(accountData.id, instance);
    await instance.start();
  }

  async startAll(accounts) {
    console.log(`[ACCOUNT-MGR] Inicjalizacja ${accounts.length} kont z bazy danych...`);
    for (const acc of accounts) {
      await this.registerAndStart(acc);
      // Odstep 4-8 sekund miedzy logowaniami (anti-spam FB)
      const jitter = 4000 + Math.random() * 4000;
      await new Promise(r => setTimeout(r, jitter));
    }
  }

  stopAll() {
    for (const inst of this.instances.values()) {
      inst.stop();
    }
    this.instances.clear();
  }

  getStatus() {
    const list = [];
    for (const [id, inst] of this.instances.entries()) {
      list.push({
        id,
        email: inst.account.email,
        status: inst.status,
        retries: inst.retryCount,
        hasProxy: !!inst.account.proxy_url
      });
    }
    return list;
  }
}

module.exports = new AccountManager();
