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
      `Jesteś ekspertem od cenzury. Twoim zadaniem jest inteligentne maskowanie obraźliwych lub nieodpowiednich słów w tekście, zachowując jego czytelność.\n\n` +
      `ZASADY:\n` +
      `1. Zachowaj pierwszą literę słowa (aby było rozpoznawalne)\n` +
      `2. Zachowaj część charakterystycznych liter w środku słowa\n` +
      `3. Zamaskuj tylko te litery, które są konieczne do ukrycia pełnej postaci słowa\n` +
      `4. Dla różnych słów użyj różnych schematów cenzury (nie używaj jednego sztywnego wzoru)\n` +
      `5. Jeśli słowo jest bardzo krótkie (2-3 litery), zamaskuj większość liter\n` +
      `6. Jeśli słowo jest dłuższe, pozostaw więcej liter widocznych\n\n` +
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