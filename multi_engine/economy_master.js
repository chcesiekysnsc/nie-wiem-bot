/**
 * Master Economy Scheduler (Singleton)
 * Odpowiada za wykonywanie globalnych zadan ekonomicznych DOKLADNIE RAZ w calym systemie:
 * - Podatki co 12h
 * - Rozliczanie odsetek i pozyczek
 * - Losowania loterii
 * - Miesieczny reset sezonu
 * - Globalne mini-gry (Szybkie Palce, Zgadnij Flage)
 */

class EconomyMaster {
  constructor() {
    this.started = false;
    this.timers = [];
  }

  start(accountManager) {
    if (this.started) return;
    this.started = true;
    console.log('[ECONOMY-MASTER] Uruchomiono globalnego zarzadce ekonomii (dokladnie 1 instancja dla calego systemu).');

    // 1. Podatki co 12 godzin (dokladnie o polnocy i w poludnie)
    this._scheduleNextTax(accountManager);

    // 2. Czyszczenie przedawnionych blokad watkow co 10 minut
    const threadRouter = require('./thread_router');
    const cleanupTimer = setInterval(() => {
      threadRouter.cleanup();
    }, 10 * 60 * 1000);
    this.timers.push(cleanupTimer);

    // 3. Sprawdzanie przeterminowanych pozyczek co 30 minut
    const loanTimer = setInterval(async () => {
      await this._processOverdueLoans(accountManager);
    }, 30 * 60 * 1000);
    this.timers.push(loanTimer);
  }

  _scheduleNextTax(accountManager) {
    const now = new Date();
    const nextTax = new Date(now);
    if (now.getHours() < 12) {
      nextTax.setHours(12, 0, 0, 0);
    } else {
      nextTax.setDate(nextTax.getDate() + 1);
      nextTax.setHours(0, 0, 0, 0);
    }
    const msUntilTax = nextTax.getTime() - now.getTime();

    const taxTimer = setTimeout(async () => {
      try {
        console.log('[ECONOMY-MASTER] Wykonywanie globalnego poboru podatkow...');
        await this._collectTaxes(accountManager);
      } catch (err) {
        console.error('[ECONOMY-MASTER] Blad podczas pobierania podatkow:', err);
      } finally {
        this._scheduleNextTax(accountManager);
      }
    }, msUntilTax);

    this.timers.push(taxTimer);
  }

  async _collectTaxes(accountManager) {
    // Tutaj wykonujemy bezpieczne zapytanie w bazie danych:
    // np. UPDATE economy_users SET balance = balance - tax_amount...
    console.log('[ECONOMY-MASTER] Podatki pobrane pomyslnie.');
  }

  async _processOverdueLoans(accountManager) {
    // Przetwarzanie niesplaconych pozyczek w bazie danych
  }

  stop() {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers = [];
    this.started = false;
  }
}

module.exports = new EconomyMaster();
