/**
 * Thread Router & Deconfliction Manager
 * Zabezpiecza przed podwojnym odpowiadaniem, gdy 2 lub wiecej botow znajduje sie w tej samej grupie.
 * Przypisuje grupe do jednego konta (Primary Owner).
 */

class ThreadRouter {
  constructor() {
    this.threadOwners = new Map(); // threadId -> { accountId, lastSeen }
    this.TTL_MS = 30 * 60 * 1000; // 30 minut waznosci przypisania
  }

  /**
   * Sprawdza czy dane konto ma prawo odpowiedziec na wiadomosc w tej grupie.
   * @param {string} threadId ID grupy lub czatu
   * @param {string|number} accountId ID bota ktory otrzymal event
   * @returns {boolean} true jesli konto moze odpowiedziec, false jesli inne konto ma pierwszenstwo
   */
  canHandle(threadId, accountId) {
    if (!threadId) return true;
    const now = Date.now();
    const current = this.threadOwners.get(threadId);

    // Jesli brak wlasciciela lub poprzedni wygasl
    if (!current || (now - current.lastSeen > this.TTL_MS)) {
      this.threadOwners.set(threadId, { accountId, lastSeen: now });
      return true;
    }

    // Jesli to to samo konto
    if (String(current.accountId) === String(accountId)) {
      current.lastSeen = now;
      return true;
    }

    // Grupe obsluguje juz inne konto z naszego systemu — ignoruj
    return false;
  }

  /**
   * Reczne wymuszenie wlasciciela grupy (np. gdy uzytkownik w panelu przypisze bota do grupy)
   */
  assignOwner(threadId, accountId) {
    this.threadOwners.set(threadId, { accountId, lastSeen: Date.now() });
  }

  /**
   * Czyszczenie przedawnionych wpisow z pamieci
   */
  cleanup() {
    const now = Date.now();
    for (const [tId, val] of this.threadOwners.entries()) {
      if (now - val.lastSeen > this.TTL_MS) {
        this.threadOwners.delete(tId);
      }
    }
  }
}

module.exports = new ThreadRouter();
