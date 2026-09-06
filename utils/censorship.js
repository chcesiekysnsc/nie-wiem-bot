function getAskGemini() {
  const ai = require('../commands/ai');
  return ai.askGeminiWithFallback;
}

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
      `Jesteś ekspertem od cenzury. Twoim zadaniem jest maskowanie wulgaryzmów i słów naruszających standardy w podanym tekście przy użyciu wyłącznie znaku • (bullet point).\n\n` +
      `ZASADY CENZURY:\n` +
      `1. Używaj wyłącznie znaku • do cenzurowania.\n` +
      `2. Zawsze pozostawiaj pierwsze dwie litery wulgaryzmu NIETKNIĘTE (np. dla "chuj" początek to "ch", dla "kurwa" to "ku", dla "spierdalaj" to "sp").\n` +
      `3. Znaki • NIE mogą tworzyć jednego ciągłego bloku (np. forma "ku••a" jest całkowicie zabroniona). Powinny być rozdzielone pojedynczymi literami tak, aby słowo było w miarę czytelne i dało się je rozczytać (np. "ku•w•" zamiast "ku••a").\n` +
      `4. Liczba użytych znaków • w słowie zależy od jego długości:\n` +
      `   - Słowa o długości 3 lub 4 litery: Zastąp dokładnie jedną literę po pierwszych dwóch literach znakiem • (np. "chuj" → "ch•j").\n` +
      `   - Słowa o długości 5 liter: Zastąp dokładnie dwie litery po pierwszych dwóch literach znakami • (muszą być rozdzielone literą, np. "kurwa" → "ku•w•").\n` +
      `   - Słowa o długości 6 liter: Zastąp dokładnie trzy litery po pierwszych dwóch literach znakami • (rozdzielonymi literami, np. "kurwis" → "ku•w•s•").\n` +
      `   - Słowa o długości 7 lub więcej liter: Zastąp wybrane litery znakami • (minimum 4 znaki • rozproszone po słowie, nie obok siebie), zachowując pierwsze dwie litery oraz ogólną czytelność słowa (np. "spierdalaj" → "sp•e•d•l•j" lub "sp•e•da•a•").\n\n` +
      `PRZYKŁADY:\n` +
      `- "chuj" → "ch•j"\n` +
      `- "debil" → "de•i•"\n` +
      `- "kurwa" → "ku•w•"\n` +
      `- "kurwy" → "ku•w•"\n` +
      `- "szmata" → "sz•a•a"\n` +
      `- "pierdol" → "pi•r•o•"\n` +
      `- "spierdalaj" → "sp•e•d•l•j"\n\n` +
      `WAŻNE:\n` +
      `- Zwróć TYLKO przetworzony tekst.\n` +
      `- Nie dodawaj żadnych wyjaśnień ani komentarzy.\n` +
      `- Zachowaj wszystkie nieobraźliwe słowa, interpunkcję i formatowanie bez zmian.\n\n` +
      `Tekst do ocenzurowania: ${text}`;

    const askGeminiWithFallback = getAskGemini();
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
