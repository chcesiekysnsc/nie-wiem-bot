const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TIKTOK_REGEX = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\/[A-Za-z0-9_./?=&-]+/i;

/**
 * Wyciąga pierwszy link do TikToka z tekstu.
 * @param {string} text 
 * @returns {string|null}
 */
function extractTikTokLink(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(TIKTOK_REGEX);
  return match ? match[0] : null;
}

/**
 * Pobiera informacje o wideo z API TikWM.
 * @param {string} videoUrl 
 * @returns {Promise<{playUrl: string, title: string, size: number, author: string}>}
 */
async function getTikTokVideoData(videoUrl) {
  try {
    // TikWM obsługuje zarówno GET jak i POST. Użyjemy POST z URLSearchParams dla stabilności.
    const params = new URLSearchParams();
    params.append('url', videoUrl);
    params.append('hd', '0');

    const res = await axios.post('https://www.tikwm.com/api/', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    if (res.data && res.data.code === 0 && res.data.data) {
      return {
        playUrl: res.data.data.play, // Link bez znaku wodnego
        title: res.data.data.title || 'Wideo z TikToka',
        size: res.data.data.size || 0, // Rozmiar w bajtach
        author: res.data.data.author?.unique_id || 'autor',
        views: res.data.data.play_count || 0,
        likes: res.data.data.digg_count || 0,
        comments: res.data.data.comment_count || 0,
        shares: res.data.data.share_count || 0
      };
    } else {
      // Próba zapasowa za pomocą GET na api.tikwm.com
      const resGet = await axios.get('https://api.tikwm.com/api/', {
        params: { url: videoUrl },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });

      if (resGet.data && resGet.data.code === 0 && resGet.data.data) {
        return {
          playUrl: resGet.data.data.play,
          title: resGet.data.data.title || 'Wideo z TikToka',
          size: resGet.data.data.size || 0,
          author: resGet.data.data.author?.unique_id || 'autor',
          views: resGet.data.data.play_count || 0,
          likes: resGet.data.data.digg_count || 0,
          comments: resGet.data.data.comment_count || 0,
          shares: resGet.data.data.share_count || 0
        };
      }

      throw new Error(res.data?.msg || resGet.data?.msg || 'Nie udało się pobrać danych o wideo z TikWM.');
    }
  } catch (error) {
    console.error('[TIKTOK API ERROR]', error.message);
    throw error;
  }
}

/**
 * Strumieniowo pobiera plik z podanego URL i zapisuje na dysku.
 * @param {string} url 
 * @param {string} destPath 
 * @returns {Promise<void>}
 */
async function downloadFile(url, destPath) {
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', (err) => {
      writer.close();
      reject(err);
    });
  });
}

module.exports = {
  extractTikTokLink,
  getTikTokVideoData,
  downloadFile
};
