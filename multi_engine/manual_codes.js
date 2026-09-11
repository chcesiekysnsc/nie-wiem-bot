/**
 * Skrzynka kodów 2FA "podanych przez czlowieka" (per konto).
 *
 * Gdy przegladarka podczas logowania stoi na monicie 2FA / kodzie z emaila,
 * logowanie wiesza sie i czeka (awaitManualCode). W tym czasie operator:
 *  - w panelu:  POST /api/accounts/:id/2fa-code  { "code": "123456" }
 *  - w konsoli: skrypt onboardingu sam o to prosi (stdin),
 *  ...a kod trafia do czekajacego logowania (submitManualCode), ktory wpisuje
 * go do przegladarki i klika zatwierdz.
 *
 * Kod TOTP z klucza ma zawsze pierwszenstwo — skrzynka sluzy gdy klucza nie ma
 * albo gdy FB wysyla kod na email/telefon (tu TOTP w ogóle nie pomaga).
 */

class ManualCodeInbox {
  constructor() {
    this.pending = new Map(); // accountId -> { resolve, reject, timer }
  }

  /**
   * Czeka na kod dla konta.
   * @returns {Promise<string>} 6-cyfrowy kod (tylko cyfry)
   */
  awaitManualCode(accountId, { timeoutMs = 180000, label = '' } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(accountId);
        reject(new Error(`Czekanie na kod 2FA dla ${label || 'konto #' + accountId} przekroczono (${Math.round(timeoutMs / 1000)}s).`));
      }, timeoutMs);
      this.pending.set(accountId, { resolve, reject, timer });
    });
  }

  /**
   * Podaje kod do czekajacego logowania.
   * @returns {{ok: boolean, error?: string}}
   */
  submitManualCode(accountId, code) {
    const digits = String(code || '').replace(/\D/g, '');
    if (digits.length < 4 || digits.length > 8) {
      return { ok: false, error: 'Kod musi miec 4-8 cyfr (np. 123456).' };
    }
    const p = this.pending.get(accountId);
    if (!p) {
      return { ok: false, error: `Konto #${accountId} nie czeka teraz na kod 2FA.` };
    }
    clearTimeout(p.timer);
    this.pending.delete(accountId);
    p.resolve(digits);
    return { ok: true };
  }

  hasPending(accountId) {
    return this.pending.has(accountId);
  }

  listPending() {
    return Array.from(this.pending.keys());
  }

  cancelAll() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      try { p.reject(new Error('Anulowano czekanie na kod 2FA.')); } catch (_) { /* ignore */ }
    }
    this.pending.clear();
  }
}

module.exports = new ManualCodeInbox();
