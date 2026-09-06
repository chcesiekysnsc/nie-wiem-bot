const { withData } = require('../utils/storage');

const ADMIN_GROUP_ID = '5277347745703557';
const TARGET_GROUP_ID = '28509642448632503';
const REVIEWER_IDS = ['61554894353095', '100053875564339'];
const INVITE_PROFILE_URL = 'https://www.facebook.com/profile.php?id=61554894353095';

const ACCEPT_KEYWORDS = ['akceptuj', 'akcept', 'accept', 'tak'];
const REJECT_KEYWORDS = ['odrzuc', 'odrzuć', 'reject', 'nie'];

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
          'Opisz swoje zgłoszenie. Zostanie ono przesłane do administratora.\n' +
          '⚠️ Pamiętaj: każdy użytkownik może wysłać tylko 1 zgłoszenie na całą historię konta!'
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
        let addErrorMsg = null;

        if (client.api && typeof client.api.addUserToGroup === 'function') {
          await new Promise(resolve => {
            client.api.addUserToGroup(report.userId, TARGET_GROUP_ID, (err) => {
              if (err) {
                console.error('[ZGLOSZENIE] Błąd podczas dodawania do grupy docelowej:', err);
                addErrorMsg = err.error || err.message || 'Błąd API FB';
                resolve();
              } else {
                addedSuccessfully = true;
                resolve();
              }
            });
          });
        }

        // Powiadomienie zgłaszającego na wątku zgłoszenia (z informacją o dodaniu i linkiem w razie blokady prywatności)
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
        'Opisz swoje zgłoszenie. Pamiętaj: każdy użytkownik może wysłać tylko 1 zgłoszenie na całą historię konta!'
      );
      return;
    }

    // Sprawdzenie czy użytkownik wysłał już zgłoszenie w historii konta
    const limitCheck = await withData(store => {
      store.profiles.reports = store.profiles.reports || [];
      const existing = store.profiles.reports.find(r => String(r.userId) === userId);
      return { alreadySubmitted: !!existing, existingReport: existing };
    });

    if (limitCheck.alreadySubmitted) {
      const st = limitCheck.existingReport?.status;
      const statusDesc = st === 'accepted' ? 'zaakceptowane' : st === 'rejected' ? 'odrzucone' : 'oczekujące na decyzję';
      await message.reply(`❌ Wysłałeś już zgłoszenie w przeszłości (numer #${limitCheck.existingReport.num}, status: ${statusDesc})! Każdy użytkownik może mieć tylko 1 zgłoszenie na całą historię konta.`);
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

    // Zapisanie zgłoszenia (BEZ FILTROWANIA)
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

    // Wysłanie zgłoszenia na grupę administracyjną (w stylu !propozycja)
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

    await message.reply(`✅ Dziękujemy za zgłoszenie! Twoje zgłoszenie (numer #${reportNum}) zostało pomyślnie przesłane do administracji.`);
  }
};
