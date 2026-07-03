const { askGeminiWithFallback } = require('../commands/ai');

/**
 * Intelligently censors offensive words while maintaining readability
 * @param {string} text - Text to censor
 * @param {string} context - Context description for the AI
 * @returns {Promise<string>} Censored text
 */
async function intelligentCensor(text, context = 'tekst użytkownika') {
  if (!text || typeof text !== 'string') {
    return text;
  }

  try {
    const promptText = 
      `Jesteś ekspertem od cenzury. Twoim zadaniem jest maskowanie obraźliwych lub nieodpowiednich słów w tekście.\n\n` +
      `ZASADY CENZURY:\n` +
      `1. Dla słów o długości 1-4 litery: zamaskuj DOKŁADNIE 1 literę (jeden symbol •)\n` +
      `2. Dla słów o długości 5 liter: zamaskuj DOKŁADNIE 2 litery (dwa symbole ••)\n` +
      `3. Dla słów o długości 6-7 liter: zamaskuj DOKŁADNIE 3 litery (trzy symbole •••)\n` +
      `4. Dla słów dłuższych niż 7 liter: zamaskuj MINIMUM 4 litery (cztery lub więcej symboli ••••)\n` +
      `5. Symbole • mogą być umieszczane w dowolnym miejscu w słowie - zastępują one zamaskowane litery\n` +
      `6. NIE WOLNO usuwać liter - zawsze używaj formy maskowania symbolami •\n` +
      `7. Dla każdego słowa wybierz, które litery zastąpić symbolami •, ale przestrzegaj wymaganej liczby symboli\n` +
      `8. Dla różnych słów użyj różnych schematów (nie używaj jednego sztywnego wzoru)\n` +
      `9. Zachowaj czytelność słowa - nie maskuj wszystkich liter\n` +
      `10. WAŻNE: NIE ZMNIEJSZAJ liczby liter w słowie - tylko zastępuj wybrane litery symbolami •. Długość słowa pozostaje taka sama!\n\n` +
      `PRZYKŁADY:\n` +
      `- "spierdalaj" → "spi*r**al*j" lub "sp**rd*l*aj"\n` +
      `- "kurwa" → "ku**a" lub "k*r*a"\n` +
      `- "chuj" → "ch*j" lub "c**j"\n` +
      `- "debil" → "de**l" lub "d*b*l"\n` +
      `- "idiota" → "id***ta" lub "i*i**a"\n\n` +
      `WAŻNE:\n` +
      `- Zwróć TYLKO przetworzony tekst\n` +
      `- Nie dodawaj żadnych wyjaśnień ani komentarzy\n` +
      `- Zachowaj wszystkie inne słowa w tekście bez zmian\n` +
      `- Zachowaj interpunkcję i formatowanie\n\n` +
      `Tekst do ocenzurowania: ${text}`;

    const aiResponse = await askGeminiWithFallback(promptText);
    if (aiResponse && aiResponse.trim()) {
      return aiResponse.trim();
    }
  } catch (err) {
    console.error('[CENSORSHIP] Error during AI censorship:', err.message);
  }

  // Fallback: return original text if AI fails
  return text;
}

module.exports = {
  intelligentCensor
};