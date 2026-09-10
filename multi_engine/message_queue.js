/**
 * Per-Account Outbound Message Queue (Rate Limiter / Anti-Flood)
 * Zabezpiecza konto przed banami Facebooka (1357004 action block)
 * Gwarantuje minimalny odstep (np. 400ms) miedzy wiadomosciami wychodzacymi na danym koncie.
 */

class AccountMessageQueue {
  constructor(accountId, minIntervalMs = 450) {
    this.accountId = accountId;
    this.minIntervalMs = minIntervalMs;
    this.queue = [];
    this.isProcessing = false;
    this.lastSendTime = 0;
  }

  enqueue(api, message, threadID, messageID = null) {
    return new Promise((resolve, reject) => {
      // Limit bufora, aby w razie awarii FB nie zapychac RAM-u
      if (this.queue.length > 100) {
        console.warn(`[QUEUE #${this.accountId}] Kolejka przepelniona (>100)! Odrzucam wiadomosc.`);
        return resolve(null);
      }

      this.queue.push({ api, message, threadID, messageID, resolve, reject });
      this._process();
    });
  }

  async _process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastSendTime;
      if (elapsed < this.minIntervalMs) {
        await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
      }

      const item = this.queue.shift();
      if (!item) break;

      try {
        await new Promise((res, rej) => {
          item.api.sendMessage(item.message, item.threadID, (err, info) => {
            this.lastSendTime = Date.now();
            if (err) {
              // Sprawdz czy to blokada FB
              const errStr = String(err || '');
              if (errStr.includes('1357004') || errStr.includes('action blocked')) {
                console.error(`[QUEUE #${this.accountId}] ⚠️ Wykryto blokade FB (1357004)! Wstrzymuje kolejke na 30s.`);
                setTimeout(() => res(null), 30000);
              } else {
                res(null);
              }
              item.resolve(null);
            } else {
              item.resolve(info);
              res(info);
            }
          }, item.messageID);
        });
      } catch (e) {
        item.resolve(null);
      }
    }

    this.isProcessing = false;
  }

  clear() {
    this.queue = [];
    this.isProcessing = false;
  }
}

class MessageQueueManager {
  constructor() {
    this.queues = new Map(); // accountId -> AccountMessageQueue
  }

  get(accountId) {
    if (!this.queues.has(accountId)) {
      this.queues.set(accountId, new AccountMessageQueue(accountId));
    }
    return this.queues.get(accountId);
  }

  remove(accountId) {
    if (this.queues.has(accountId)) {
      this.queues.get(accountId).clear();
      this.queues.delete(accountId);
    }
  }
}

module.exports = new MessageQueueManager();
