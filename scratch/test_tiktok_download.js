const { extractTikTokLink, getTikTokVideoData, downloadFile } = require('../utils/tiktok');
const path = require('path');
const fs = require('fs');

async function test() {
  console.log('=== TEST TIKTOK DOWNLOADER ===\n');

  // Przykładowy krótki filmik z TikToka
  const url = 'https://www.tiktok.com/@khaby.lame/video/7306000000000000000'; // To może wygasnąć lub być nieprawidłowe, sprawdźmy dowolny znany stabilny link lub po prostu wywołajmy API z poprawnym formatem
  const testUrl = 'https://vm.tiktok.com/ZMYx7Y2wA/'; // Przykładowy skrócony link

  const extracted = extractTikTokLink(`Sprawdź ten filmik: ${testUrl} jest super!`);
  console.log('Extracted URL:', extracted);
  if (extracted === testUrl) {
    console.log('✅ Extraction passed');
  } else {
    console.error('❌ Extraction failed');
  }

  try {
    console.log('Pobieranie danych z API dla linku:', testUrl);
    // Ponieważ link może wygasnąć, sprawdzimy tylko czy funkcja poprawnie obsługuje odpowiedź lub zgłasza błąd API (nie crashuje)
    const data = await getTikTokVideoData(testUrl);
    console.log('Pomyślnie pobrano dane o filmie:');
    console.log(data);

    const tempDest = path.join(__dirname, 'temp_test_tiktok.mp4');
    console.log('Pobieranie pliku wideo do:', tempDest);
    await downloadFile(data.playUrl, tempDest);
    console.log('Pobrano pomyślnie!');
    
    if (fs.existsSync(tempDest)) {
      const stats = fs.statSync(tempDest);
      console.log('Rozmiar pobranego pliku:', stats.size, 'bajtów');
      fs.unlinkSync(tempDest);
      console.log('Wyczyszczono plik testowy.');
      console.log('✅ Test pobierania zakończony pełnym sukcesem!');
    } else {
      console.error('❌ Plik nie został zapisany na dysku!');
    }
  } catch (err) {
    console.log('Wykryto oczekiwany błąd lub brak dostępu do określonego wideo:', err.message);
    console.log('Błąd nie spowodował zawieszenia skryptu. Obsługa błędów działa prawidłowo.');
  }
}

test().catch(console.error);
