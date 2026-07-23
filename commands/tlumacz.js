const { askGeminiWithFallback } = require('./ai');

const ALLOWED_LANGUAGES = new Set([
  'angielski','polski','niemiecki','francuski','hiszpański','włoski','portugalski',
  'rosyjski','japoński','koreański','chiński','arabski','turecki','holenderski',
  'szwedzki','norweski','duński','fiński','grecki','czeski','słowacki','węgierski',
  'rumuński','bułgarski','serbski','chorwacki','słoweński','litewski','łotewski',
  'estoński','ukraiński','białoruski','hebrajski','jidisz','perski','mongolski',
  'wietnamski','tajski','kambodżański','malezjski','indonezyjski','filipiński',
  'hindi','bengalski','urdu','tamilski','telugu','kannada','malajalam','sinhalski',
  'burmański','khmerski','swahili','afrykanerski','zulu','xhosa','yoruba','hausa',
  'amharski','somali','kazachski','uzbecki','azerbejdżański','armenski','gruziński',
  'rzymski','łaciński','starożytny','egipski','grecki starożytny','mandaryński',
  'kantoński','amerykański','brytyjski','australijski','kanadyjski','irlandzki',
  'szkocki','walijski','bretoński','kataloński','galicyjski','baskijski'
]);

const LANGUAGE_ALIASES = {
  'en':'angielski','eng':'angielski','english':'angielski',
  'de':'niemiecki','ger':'niemiecki','german':'niemiecki','niem':'niemiecki',
  'fr':'francuski','fra':'francuski','french':'francuski','franc':'francuski',
  'es':'hiszpański','spa':'hiszpański','spanish':'hiszpański','hiszp':'hiszpański',
  'it':'włoski','ita':'włoski','italian':'włoski','wlosk':'włoski',
  'pt':'portugalski','por':'portugalski','portuguese':'portugalski',
  'ru':'rosyjski','rus':'rosyjski','russian':'rosyjski','rosyjsk':'rosyjski',
  'ja':'japoński','jpn':'japoński','japanese':'japoński','jap':'japoński',
  'ko':'koreański','kor':'koreański','korean':'koreański','kore':'koreański',
  'zh':'chiński','chi':'chiński','chinese':'chiński','chin':'chiński',
  'ar':'arabski','ara':'arabski','arabic':'arabski','arab':'arabski',
  'tr':'turecki','tur':'turecki','turkish':'turecki','turk':'turecki',
  'nl':'holenderski','nld':'holenderski','dutch':'holenderski','hol':'holenderski',
  'sv':'szwedzki','swe':'szwedzki','swedish':'szwedzki','szwe':'szwedzki',
  'no':'norweski','nor':'norweski','norwegian':'norweski',
  'da':'duński','dan':'duński','danish':'duński','dansk':'duński',
  'fi':'fiński','fin':'fiński','finnish':'fiński',
  'el':'grecki','gre':'grecki','greek':'grecki',
  'cs':'czeski','cze':'czeski','czech':'czeski','czes':'czeski',
  'sk':'słowacki','slk':'słowacki','slovak':'słowacki','slowacki':'słowacki',
  'hu':'węgierski','hun':'węgierski','hungarian':'węgierski','weng':'węgierski',
  'ro':'rumuński','ron':'rumuński','romanian':'rumuński','rum':'rumuński',
  'bg':'bułgarski','bul':'bułgarski','bulgarian':'bułgarski','bulg':'bułgarski',
  'sr':'serbski','srp':'serbski','serbian':'serbski','serb':'serbski',
  'hr':'chorwacki','hrv':'chorwacki','croatian':'chorwacki','chorw':'chorwacki',
  'sl':'słoweński','slv':'słoweński','slovenian':'słoweński','slowenski':'słoweński',
  'lt':'litewski','lit':'litewski','lithuanian':'litewski','litew':'litewski',
  'lv':'łotewski','lav':'łotewski','latvian':'łotewski','lot':'łotewski',
  'et':'estoński','est':'estoński','estonian':'estoński','estonski':'estoński',
  'uk':'ukraiński','ukr':'ukraiński','ukrainian':'ukraiński','ukra':'ukraiński',
  'be':'białoruski','bel':'białoruski','belarusian':'białoruski','bialoruski':'białoruski',
  'he':'hebrajski','heb':'hebrajski','hebrew':'hebrajski','hebr':'hebrajski',
  'fa':'perski','per':'perski','persian':'perski','pers':'perski',
  'la':'łaciński','lat':'łaciński','latin':'łaciński','latin':'łaciński',
  'pl':'polski','pol':'polski','polish':'polski','polski':'polski',
  'am':'amharski','amh':'amharski','amharic':'amharski',
  'sw':'swahili','swa':'swahili','swahili':'swahili',
  'af':'afrykanerski','afr':'afrykanerski','afrikaans':'afrykanerski','afryk':'afrykanerski'
};

function normalizeLanguage(raw) {
  const lower = String(raw || '').trim().toLowerCase();
  if (!lower) return null;
  if (ALLOWED_LANGUAGES.has(lower)) return lower;
  if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
  return lower;
}

module.exports = {
  name: 'tlumacz',
  aliases: ['translate', 'tl'],
  async execute(client, message, args) {
    if (args.length < 2) {
      await message.reply(
        '❌ Użycie: !tlumacz <treść> <język>\n\n' +
        'Przykłady:\n' +
        '• !tlumacz hello world angielski\n' +
        '• !tlumacz jak się masz francuski\n' +
        '• !tlumacz good morning japoński\n\n' +
        'Język docelowy podaj jako słowo, np. angielski, niemiecki, francuski, hiszpański, japoński itp.'
      );
      return;
    }

    const lastArg = args[args.length - 1];
    const targetLanguage = normalizeLanguage(lastArg);

    if (!targetLanguage) {
      await message.reply(`❌ Nie rozpoznałem języka "${lastArg}". Podaj język docelowy jako słowo, np. angielski, niemiecki, francuski, hiszpański, japoński itp.`);
      return;
    }

    const text = args.slice(0, -1).join(' ').trim();
    if (!text) {
      await message.reply('❌ Podaj treść do przetłumaczenia.');
      return;
    }

    const promptText =
      `Jesteś tłumaczem. Przetłumacz poniższą treść na język: ${targetLanguage}.\n` +
      `Zasady:\n` +
      `- Zachowaj sens i styl oryginału.\n` +
      `- Nie dodawaj żadnych komentarzy, wyjaśnień ani wstępów — zwróć tylko tłumaczenie.\n` +
      `- Jeśli treść zawiera słowa nieznane w języku docelowym, zachowaj je w oryginalnej formie.\n\n` +
      `Treść do przetłumaczenia:\n"${text}"`;

    try {
      await message.reply(`🌍 Tłumaczę na: **${targetLanguage}**...`);
      const translation = await askGeminiWithFallback(promptText);
      await message.reply(`🌍 **Tłumaczenie (${targetLanguage}):**\n\n${translation}`);
    } catch (err) {
      console.error('[TLUMACZ] Błąd:', err);
      await message.reply('❌ Wystąpił błąd podczas tłumaczenia. Spróbuj ponownie za chwilę.');
    }
  }
};
