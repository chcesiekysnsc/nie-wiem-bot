const { withData } = require('../utils/storage');
const { askGeminiWithFallback } = require('./ai');

const ADMIN_GROUP_ID = '5277347745703557';
const TARGET_GROUP_ID = '28509642448632503';
const REVIEWER_IDS = ['61554894353095', '100053875564339'];
const INVITE_PROFILE_URL = 'https://www.facebook.com/profile.php?id=61554894353095';

const ACCEPT_KEYWORDS = ['akceptuj', 'akcept', 'accept', 'tak'];
const REJECT_KEYWORDS = ['odrzuc', 'odrzuć', 'reject', 'nie'];

const BLOCKED_REASON_TEXT =
  'to jest komenda do zglaszania sie na grupe od pomyslow na usprawnienia i nowe komendy jesli jestes zainteresowany, napisz ze chcesz dolaczyc do tej grp jesli chcesz dac pomysl badz zglosic blad uzyj !propzycja';

/**
 * Filtr AI sprawdzający, czy treść zgłoszenia to propozycja komendy lub zgłoszenie błędu.
 * Jeśli tak -> blokujemy i odsyłamy do !propozycja.
 * Jeśli to chęć dołączenia do grupy -> przepuszczamy.
 */
async function checkWithAiFilter(content) {
  const lower = String(content || '').toLowerCase();

  // Słowa kluczowe wskazujące na błąd
  const bugKeywords = [
    'błąd', 'blad', 'bug', 'zbugowan', 'nie dziala', 'nie działa',
    'crash', 'crashuje', 'wywala bota', 'blad w komendzie', 'błąd w komendzie'
  ];
  const hasBug = bugKeywords.some(w => lower.includes(w));

  // Słowa kluczowe wskazujące na propozycję nowej komendy lub mechaniki
  const proposalKeywords = [
    'proponuje', 'proponuję', 'propozycja', 'nowa komenda', 'nową komendę',
    'nowe komendy', 'dodajcie komende', 'dodaj komende', 'dodaj komendę',
    'nowy przedmiot', 'nowa funkcja', 'pomysl na', 'pomysł na'
  ];
  const hasProposal = proposalKeywords.some(w => lower.includes(w));

  // Słowa wskazujące na intencję dołączenia do grupy
  const groupIntentKeywords = [
    'do grupy', 'na grupę', 'na grupe', 'dołaczyć', 'dołączyć', 'dolaczyc',
    'dodaj mnie', 'chcę dołączyć', 'chce dolaczyc', 'zapisz mnie', 'kandydat',
    'chce byc na grupie', 'chcę być na grupie', 'chcialbym dolaczyc', 'chciałbym dołączyć',
    'dolaczenie', 'dołączenie', 'chce dojsc', 'chcę dojść', 'moge do grupy', 'mogę do grupy'
  ];
  const hasGroupIntent = groupIntentKeywords.some(w => lower.includes(w));

  // Oczywiste propozycje/błędy bez wzmianki o grupie blokujemy natychmiast
  if ((hasBug || hasProposal) && !hasGroupIntent) {
    return { shouldBlock: true, reason: 'heuristic' };
  }

  // Weryfikacja za pomocą AI
  const promptText =
    `Jesteś precyzyjnym filtrem zgłoszeń w bocie na Messengerze.\n` +
    `Komenda "!zgloszenie" służy do rekrutacji / zgłaszania chęci dołączenia do grupy od pomysłów na usprawnienia i nowe komendy.\n` +
    `Zabronione w komendzie "!zgloszenie" są:\n` +
    `1. Składanie propozycji nowych komend, gier, przedmiotów, mechanik lub usprawnień (do tego gracze muszą użyć komendy !propozycja).\n` +
    `2. Zgłaszanie błędów, problemów technicznych, bugów (do tego gracze muszą użyć komendy !propozycja).\n\n` +
    `Dozwolone w komendzie "!zgloszenie" są:\n` +
    `- Zgłoszenie chęci dołączenia do grupy / prośba o dodanie na grupę / deklaracja pomocy na grupie / kandydatura do grupy.\n\n` +
    `Treść wiadomości użytkownika:\n"${content}"\n\n` +
    `Decyzja:\n` +
    `- Jeśli ta wiadomość to propozycja komendy/funkcji/gry ALBO zgłoszenie błędu/buga -> odpowiedz: BLOKUJ\n` +
    `- Jeśli ta wiadomość to zgłoszenie chęci dołączenia do grupy / prośba o dodanie -> odpowiedz: PRZEPUSC\n\n` +
    `Odpowiedz DOKŁADNIE jednym słowem w pierwszej linii: BLOKUJ lub PRZEPUSC.`;

  try {
    const aiRes = await askGeminiWithFallback(promptText);
    const firstWord = String(aiRes || '').trim().split(/\s+/)[0].toUpperCase();
    if (firstWord.includes('BLOKUJ')) {
      return { shouldBlock: true, reason: 'ai' };
    }
    return { shouldBlock: false };
  } catch (err) {
    console.error('[ZGLOSZENIE-AI] Błąd zapytania do Gemini:', err.message);
    if (hasBug || hasProposal) {
      return { shouldBlock: true, reason: 'heuristic_fallback' };
    }
    return { shouldBlock: false };
  }
}

module.exports = {
  name: 'zgloszenie',
  aliases: ['zgloszenia', 'zglos', 'zglsozenie'],

  async execute(client, message, args) {
    const userId = String(message.author.id);
    const isReviewer = REVIEWER_IDS.includes(userId);

    // Sprawdzenie czy nie podano żadnych argumentów
    if (args.length === 0) {
      if (isReviewer) {
        await message.reply(
          '📋 **PANEL ZGŁOSZEŃ**\n\n' +
          '• `!zgloszenie <nr> akceptuj` — akceptuje zgłoszenie i dodaje użytkownika do grupy\n' +
          '• `!zgloszenie <nr> odrzuc` — odrzuca zgłoszenie z powiadomieniem\n' +
          '• `!zgloszenie lista` — wyświetla listę oczekujących zgłoszeń'
        );
      } else {
        await message.reply(
          '❌ Użycie: !zgloszenie <treść>\n\n' +
          'Napisz, że chcesz dołączyć do grupy od pomysłów na usprawnienia i nowe komendy.\n' +
          '⚠️ Pamiętaj: każdy użytkownik może wysłać maksymalnie 2 zgłoszenia na całą historię konta!\n' +
          '💡 Jeśli chcesz zgłosić błąd lub zaproponować komendę, użyj: **!propozycja**'
        );
      }
      return;
    }

    // Sprawdzenie akcji administratora (lista oczekujących)
    if (isReviewer && ['lista', 'list', 'oczekujace'].includes(args[0].toLowerCase())) {
      const pendingList = await withData(store => {
        store.profiles.reports = store.profiles.reports || [];
        return store.profiles.reports.filter(r => r.status === 'pending');
      });

      if (pendingList.length === 0) {
        await message.reply('ℹ️ Brak oczekujących zgłoszeń.');
        return;
      }

      let text = `📋 **OCZEKUJĄCE ZGŁOSZENIA (${pendingList.length}):**\n\n`;
      for (const r of pendingList.slice(0, 15)) {
        text += `• **#${r.num}** | ${r.authorName} (${r.userId})\n  Treść: "${r.content.slice(0, 80)}..."\n  Decyzja: \`!zgloszenie ${r.num} akceptuj\` / \`!zgloszenie ${r.num} odrzuc\`\n\n`;
      }
      await message.reply(text);
      return;
    }

    // Wykrywanie czy to polecenie akceptacji / odrzucenia
    let actionNum = null;
    let actionType = null; // 'accept' | 'reject'

    const firstArg = args[0].toLowerCase();
    const secondArg = args[1] ? args[1].toLowerCase() : null;

    if (!isNaN(parseInt(firstArg, 10)) && secondArg) {
      if (ACCEPT_KEYWORDS.includes(secondArg)) {
        actionNum = parseInt(firstArg, 10);
        actionType = 'accept';
      } else if (REJECT_KEYWORDS.includes(secondArg)) {
        actionNum = parseInt(firstArg, 10);
        actionType = 'reject';
      }
    } else if (!isNaN(parseInt(secondArg, 10))) {
      if (ACCEPT_KEYWORDS.includes(firstArg)) {
        actionNum = parseInt(secondArg, 10);
        actionType = 'accept';
      } else if (REJECT_KEYWORDS.includes(firstArg)) {
        actionNum = parseInt(secondArg, 10);
        actionType = 'reject';
      }
    }

    // Obsługa decyzji (akceptuj / odrzuc)
    if (actionType !== null && actionNum !== null) {
      if (!isReviewer) {
        await message.reply('❌ Tylko uprawnieni administratorzy mogą decydować o zgłoszeniach.');
        return;
      }

      const decisionResult = await withData(store => {
        store.profiles.reports = store.profiles.reports || [];
        const report = store.profiles.reports.find(r => r.num === actionNum);

        if (!report) {
          return { error: `❌ Nie znaleziono zgłoszenia o numerze **#${actionNum}**.` };
        }

        if (report.status !== 'pending') {
          const statusText = report.status === 'accepted' ? 'zaakceptowane' : 'odrzucone';
          return { error: `⚠️ Zgłoszenie **#${actionNum}** zostało już wcześniej ${statusText}.` };
        }

        report.status = actionType === 'accept' ? 'accepted' : 'rejected';
        report.resolvedAt = Date.now();
        report.resolvedBy = userId;

        return { success: true, report: Object.assign({}, report) };
      });

      if (decisionResult.error) {
        await message.reply(decisionResult.error);
        return;
      }

      const report = decisionResult.report;

      if (actionType === 'accept') {
        // Dodanie użytkownika do grupy docelowej
        let addedSuccessfully = false;

        if (client.api && typeof client.api.addUserToGroup === 'function') {
          await new Promise(resolve => {
            client.api.addUserToGroup(report.userId, TARGET_GROUP_ID, (err) => {
              if (err) {
                console.error('[ZGLOSZENIE] Błąd podczas dodawania do grupy docelowej:', err);
                resolve();
              } else {
                addedSuccessfully = true;
                resolve();
              }
            });
          });
        }

        // Powiadomienie zgłaszającego na wątku zgłoszenia
        if (client.api && typeof client.api.sendMessage === 'function') {
          const userMsg =
            `🎉 **Twoje zgłoszenie (#${report.num}) zostało ZAAKCEPTOWANE!**\n` +
            `Dodano Cię do grupy! A jeśli nie, to zaproś użytkownika:\n${INVITE_PROFILE_URL}`;

          client.api.sendMessage(
            userMsg,
            report.threadId,
            (err) => {
              if (err) console.error('[ZGLOSZENIE] Błąd wysyłania odpowiedzi na wątek zgłoszenia:', err);
            },
            report.messageId
          );
        }

        let adminResponse = `✅ **Zaakceptowano zgłoszenie #${report.num}!**\n👤 Użytkownik: **${report.authorName}** (ID: \`${report.userId}\`)\n`;
        if (addedSuccessfully) {
          adminResponse += `➕ Został pomyślnie dodany do grupy docelowej (\`${TARGET_GROUP_ID}\`).`;
        } else {
          adminResponse += `⚠️ Zgłoszenie zaakceptowane. Jeśli FB zablokował automatyczne dodanie: użytkownik otrzymał link do profilu, aby wysłać zaproszenie.`;
        }

        await message.reply(adminResponse);
        return;
      }

      if (actionType === 'reject') {
        // Powiadomienie zgłaszającego o odrzuceniu na wątku zgłoszenia
        if (client.api && typeof client.api.sendMessage === 'function') {
          const userMsg = `❌ **Twoje zgłoszenie (#${report.num}) zostało ODRZUCONE.**\nTwoje zgłoszenie nie zostało zaakceptowane przez administrację.`;
          client.api.sendMessage(
            userMsg,
            report.threadId,
            (err) => {
              if (err) console.error('[ZGLOSZENIE] Błąd wysyłania odpowiedzi na wątek zgłoszenia:', err);
            },
            report.messageId
          );
        }

        await message.reply(`❌ **Odrzucono zgłoszenie #${report.num}!**\n👤 Użytkownik: **${report.authorName}** (ID: \`${report.userId}\`)\nWysłano informację o odrzuceniu na wątek zgłoszenia.`);
        return;
      }
    }

    // ==========================================
    // WYSYŁANIE NOWEGO ZGŁOSZENIA PRZEZ UŻYTKOWNIKA
    // ==========================================
    const content = args.join(' ').trim();

    if (!content) {
      await message.reply(
        '❌ Użycie: !zgloszenie <treść>\n\n' +
        'Napisz, że chcesz dołączyć do grupy od pomysłów na usprawnienia i nowe komendy.\n' +
        '⚠️ Pamiętaj: każdy użytkownik może wysłać maksymalnie 2 zgłoszenia na całą historię konta!\n' +
        '💡 Jeśli chcesz zgłosić błąd lub zaproponować komendę, użyj: **!propozycja**'
      );
      return;
    }

    // Sprawdzenie czy użytkownik nie przekroczył limitu 2 zgłoszeń na konto
    const limitCheck = await withData(store => {
      store.profiles.reports = store.profiles.reports || [];
      const userReports = store.profiles.reports.filter(r => String(r.userId) === userId);
      return { count: userReports.length, reports: userReports };
    });

    if (limitCheck.count >= 2) {
      const numbers = limitCheck.reports.map(r => '#' + r.num).join(', ');
      await message.reply(
        `❌ Wykorzystałeś już limit 2 zgłoszeń na całą historię konta! (Twoje zgłoszenia: ${numbers})`
      );
      return;
    }

    // Filtr AI: sprawdzenie czy treść to propozycja komendy lub zgłoszenie błędu
    const filterResult = await checkWithAiFilter(content);
    if (filterResult.shouldBlock) {
      await message.reply(BLOCKED_REASON_TEXT);
      return;
    }

    // Pobranie nazwy użytkownika
    let authorName = `Użytkownik_${userId.slice(-6)}`;
    if (typeof client.resolveUserName === 'function') {
      try {
        const resolved = await client.resolveUserName(userId);
        if (resolved && !resolved.startsWith('Użytkownik_')) {
          authorName = resolved;
        }
      } catch (_) {}
    } else if (client.userNames && client.userNames.has(userId)) {
      authorName = client.userNames.get(userId);
    }

    // Zapisanie zgłoszenia
    const reportNum = await withData(store => {
      store.profiles.reports = store.profiles.reports || [];
      const num = store.profiles.reports.length + 1;

      const newReport = {
        num,
        userId,
        authorName,
        content,
        threadId: message.rawEvent.threadID,
        messageId: message.rawEvent.messageID,
        timestamp: Date.now(),
        status: 'pending',
        resolvedAt: null,
        resolvedBy: null
      };

      store.profiles.reports.push(newReport);
      return num;
    });

    // Wysłanie zgłoszenia na grupę administracyjną
    if (client.api && typeof client.api.sendMessage === 'function') {
      const adminMsg =
        `📋 **ZGŁOSZENIE #${reportNum}**\n` +
        `👤 Zgłosił: ${authorName} (ID: ${userId})\n\n` +
        `${content}\n\n` +
        `⚖️ **Decyzja:**\n` +
        `• !zgloszenie ${reportNum} akceptuj\n` +
        `• !zgloszenie ${reportNum} odrzuc`;

      client.api.sendMessage(adminMsg, ADMIN_GROUP_ID, (err) => {
        if (err) {
          console.error('[ZGLOSZENIE] Błąd wysyłania na grupę administracyjną:', err);
        }
      });
    }

    await message.reply(
      `✅ Dziękujemy za zgłoszenie! Twoje zgłoszenie (numer #${reportNum}, wykorzystano: ${limitCheck.count + 1}/2) zostało pomyślnie przesłane do administracji.`
    );
  }
};
