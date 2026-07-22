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
      `1. Używaj WYŁĄCZNIE symbolu · do cenzurowania (nie używaj *, #, _, -, █ ani żadnych innych symboli)\n` +
      `2. Każde wykryte słowo naruszające standardy zastępuj JEDNYM ciągiem symboli · o długości zależnej od długości słowa:\n` +
      `   - słowa do 4 liter: 1 symbol ·\n` +
      `   - słowa 5-6 liter: 2 symbole ··\n` +
      `   - słowa 7 liter i więcej: minimum 3 symbole ··· (możesz użyć więcej według własnego uznania)\n` +
      `3. NIE WOLNO usuwać słów - tylko zastępuj je ciągiem symboli ·\n` +
      `4. NIE WOLNO zmieniać liter na inne znaki - całe słowo jest zastępowane symbolem ·\n` +
      `5. NIE WOLNO skracać słów - długość cenzury zależy od długości oryginalnego słowa\n` +
      `6. Cenzuruj WYŁĄCZNIE słowa naruszające standardy społeczności Facebooku (wyzwiska, mowa nienawiści, obraźliwe określenia chronionych grup, nawoływanie do przemocy)\n` +
      `7. NIE cenzuruj słów, które same w sobie nie stanowią naruszenia standardów\n` +
      `8. Każde wykryte słowo zastąp JEDNYM ciągiem symboli · (jeśli słowo ma 5-6 liter, ciąg ma 2 symbole, itd.)\n` +
      `9. Zachowaj czytelność tekstu - cenzuruj tylko wyraźnie obraźliwe słowa\n\n` +
      `PRZYKŁADY:\n` +
      `- "spierdalaj" → "······"\n` +
      `- "kurwa" → "··"\n` +
      `- "chuj" → "···"\n` +
      `- "debil" → "···"\n` +
      `- "idiota" → "·······"\n\n` +
      `WAŻNE:\n` +
      `- Zwróć TYLKO przetworzony tekst\n` +
      `- Nie dodawaj żadnych wyjaśnień ani komentarzy\n` +
      `- Zachowaj wszystkie inne słowa w tekście bez zmian\n` +
      `- Zachowaj interpunkcję i formatowanie\n` +
      `- Całe obraźliwe słowo jest zastępowane ciągiem symboli ·\n` +
      `- Wyróżniaj je według długości oryginalnego słowa\n\n` +
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
