const { extractTikTokLink, getTikTokVideoData, downloadFile } = require('../utils/tiktok');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('=== TESTY DLA INTERCEPTORA TIKTOKA W SELF_BOT.JS ===\n');

  const threadId = 'test_thread_123';
  const senderId = 'sender_user_456';
  const messageId = 'test_msg_999';

  // Funkcja symulująca logikę obsługi wiadomości z TikToka
  async function simulateMessageHandler(event, mockApi) {
    if (!['message', 'message_reply'].includes(event.type) || !event.body) {
      return 'SKIPPED_NOT_MESSAGE';
    }

    const text = event.body.trim();
    const tiktokLink = extractTikTokLink(text);
    
    // Sprawdzamy czy to komenda
    const isCommand = text.startsWith('!'); // mock prefix
    
    if (tiktokLink && !isCommand) {
      console.log(`[SIMULATOR] Wykryto link do TikToka: ${tiktokLink}`);
      mockApi.setMessageReaction('⏳', event.messageID, () => {});

      const tempFile = path.join(__dirname, 'tiktok_temp_test.mp4');
      try {
        const data = await getTikTokVideoData(tiktokLink);
        const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

        if (data.size > MAX_SIZE) {
          console.log(`[SIMULATOR] Film zbyt duży, wysyłam link zapasowy.`);
          mockApi.sendMessage(
            `⚠️ Wideo za duże\nLink: ${data.playUrl}`,
            event.threadID,
            () => {},
            event.messageID
          );
          return 'SENT_BACKUP_LINK';
        }

        console.log(`[SIMULATOR] Pobieranie do: ${tempFile}`);
        await downloadFile(data.playUrl, tempFile);

        console.log(`[SIMULATOR] Wysyłanie pliku jako załącznik...`);
        let result = await new Promise((resolve) => {
          mockApi.sendMessage({
            body: `🎥 TikTok od @${data.author}`,
            attachment: 'MOCK_STREAM'
          }, event.threadID, (err) => {
            if (err) resolve('SEND_ERROR');
            else {
              mockApi.setMessageReaction('✅', event.messageID, () => {});
              resolve('SENT_VIDEO');
            }
          }, event.messageID);
        });

        // Usuwanie pliku
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
          console.log(`[SIMULATOR] Usunięto plik tymczasowy.`);
        }

        return result;

      } catch (err) {
        console.error('[SIMULATOR ERROR]', err.message);
        mockApi.setMessageReaction('❌', event.messageID, () => {});
        return 'ERROR';
      }
    }

    return 'NOT_TIKTOK_LINK';
  }

  // Definicja mock API
  let apiCalls = [];
  let reactions = [];
  const mockApi = {
    setMessageReaction: (emoji, msgId, cb) => {
      reactions.push({ emoji, msgId });
      cb(null);
    },
    sendMessage: (msg, tId, cb, msgId) => {
      apiCalls.push({ msg, tId, msgId });
      cb(null);
    }
  };

  // Test 1: Wiadomość zawierająca poprawny link TikToka
  console.log('--- TEST 1: Wiadomość z linkiem TikToka ---');
  apiCalls = [];
  reactions = [];
  const event1 = {
    type: 'message',
    body: 'Zobacz ten fajny filmik https://vm.tiktok.com/ZMYx7Y2wA/ i powiedz co myślisz',
    threadID: threadId,
    senderID: senderId,
    messageID: messageId
  };

  const res1 = await simulateMessageHandler(event1, mockApi);
  console.log('Wynik Testu 1:', res1);
  console.log('Wywołane reakcje:', reactions);
  console.log('Wysłane wiadomości API:', apiCalls.length);

  if (res1 === 'SENT_VIDEO' && reactions.some(r => r.emoji === '⏳') && reactions.some(r => r.emoji === '✅')) {
    console.log('✅ TEST 1 PASSED!');
  } else {
    console.error('❌ TEST 1 FAILED!');
  }

  // Test 2: Wiadomość bez linku do TikToka
  console.log('\n--- TEST 2: Zwykła wiadomość ---');
  apiCalls = [];
  reactions = [];
  const event2 = {
    type: 'message',
    body: 'Siemanko co tam słychać na grupie?',
    threadID: threadId,
    senderID: senderId,
    messageID: messageId
  };

  const res2 = await simulateMessageHandler(event2, mockApi);
  console.log('Wynik Testu 2:', res2);
  if (res2 === 'NOT_TIKTOK_LINK' && apiCalls.length === 0 && reactions.length === 0) {
    console.log('✅ TEST 2 PASSED!');
  } else {
    console.error('❌ TEST 2 FAILED!');
  }

  console.log('\n=== TESTY UKOŃCZONE ===');
}

runTests().catch(console.error);
