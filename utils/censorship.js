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
      `Jesteś ekspertem od cenzury. Twoim zadaniem jest maskowanie słów, które mogą skutkować banem lub sankcjami na Facebooku (ciężkie wyzwiska, mowa nienawiści, obraźliwe określenia chronionych grup, nawoływanie do przemocy).\n\n` +
      `ZASADY CENZURY:\n` +
      `1. Używaj WYŁĄCZNIE symbolu • do cenzurowania (nie używaj *, #, _, -, █ ani żadnych innych symboli)\n` +
      `2. Każda ocenzurowana litera jest zastępowana JEDNYM symbolem •\n` +
      `3. NIE WOLNO usuwać liter - tylko zastępuj je symbolem •\n` +
      `4. NIE WOLNO zmieniać liter na inne znaki - tylko zastępuj je symbolem •\n` +
      `5. NIE WOLNO skracać słów - długość słowa pozostaje taka sama\n` +
      `6. Cenzuruj WYŁĄCZNIE słowa naruszające standardy społeczności Facebooku (wyzwiska, mowa nienawiści, obraźliwe określenia chronionych grup, nawoływanie do przemocy)\n` +
      `7. NIE cenzuruj słów, które same w sobie nie stanowią naruszenia standardów\n` +
      `8. Dla każdego słowa wybierz, które litery zastąpić symbolem •\n` +
      `9. Dla różnych słów użyj różnych schematów (nie używaj jednego sztywnego wzoru)\n` +
      `10. Zachowaj czytelność słowa - nie maskuj wszystkich liter\n\n` +
      `PRZYKŁADY:\n` +
      `- "spierdalaj" → "spi•rd•l•j" lub "sp•rd•l•aj"\n` +
      `- "kurwa" → "ku•a" lub "k•r•a"\n` +
      `- "chuj" → "ch•j" lub "c•uj"\n` +
      `- "debil" → "de•il" lub "d•bi•l"\n` +
      `- "idiota" → "idi•ta" lub "i•io•a"\n\n` +
      `WAŻNE:\n` +
      `- Zwróć TYLKO przetworzony tekst\n` +
      `- Nie dodawaj żadnych wyjaśnień ani komentarzy\n` +
      `- Zachowaj wszystkie inne słowa w tekście bez zmian\n` +
      `- Zachowaj interpunkcję i formatowanie\n` +
      `- Każda zamaskowana litera = jeden symbol •\n` +
      `- Długość słowa NIE ZMIENIA SIĘ - tylko litery są zastępowane symbolami •\n\n` +
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