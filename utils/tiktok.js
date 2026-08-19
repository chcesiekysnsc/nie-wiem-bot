const axios = require('axios');
const fs = require('fs');

// Regular expression to match standard and shortened TikTok links
const TIKTOK_REGEX = /https?:\/\/(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.-]+\/video\/\d+|https?:\/\/(?:vm\.|vt\.|v\.)?tiktok\.com\/[A-Za-z0-9_./?=&-]+/i;

/**
 * Extracts the first TikTok link from text.
 * @param {string} text 
 * @returns {string|null}
 */
function extractTikTokLink(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(TIKTOK_REGEX);
  return match ? match[0] : null;
}

/**
 * Resolves redirects for shortened TikTok URLs (like vm.tiktok.com, vt.tiktok.com, v.tiktok.com).
 * @param {string} url 
 * @returns {Promise<string>}
 */
async function resolveRedirect(url) {
  if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com') || url.includes('v.tiktok.com')) {
    try {
      console.log(`[TIKTOK RESOLVER] Resolving redirect for shortened URL: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        maxRedirects: 5,
        timeout: 8000
      });
      const resolved = response.request.res.responseUrl || url;
      console.log(`[TIKTOK RESOLVER] Resolved to: ${resolved}`);
      return resolved;
    } catch (err) {
      console.error('[TIKTOK RESOLVER ERROR] Failed to resolve redirect:', err.message);
      return url;
    }
  }
  return url;
}

/**
 * Fetches TikTok video data from TikWM API.
 * Uses x-www-form-urlencoded POST as primary and GET as fallback.
 * @param {string} videoUrl 
 * @returns {Promise<{playUrl: string, title: string, size: number, author: string, views: number, likes: number, comments: number, shares: number}>}
 */
async function getTikTokVideoData(videoUrl) {
  const resolvedUrl = await resolveRedirect(videoUrl);

  // User-Agent string to mimic browser request
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // 1. Primary: POST to tikwm.com/api/ using form-urlencoded data
  try {
    console.log(`[TIKTOK API] Sending POST request to TikWM for: ${resolvedUrl}`);
    const params = new URLSearchParams();
    params.append('url', resolvedUrl);
    params.append('hd', '0');

    const res = await axios.post('https://www.tikwm.com/api/', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent
      },
      timeout: 10000
    });

    if (res.data && res.data.code === 0 && res.data.data) {
      console.log('[TIKTOK API] Successfully fetched video data via POST');
      return {
        playUrl: res.data.data.play,
        title: res.data.data.title || 'Wideo z TikToka',
        size: res.data.data.size || 0,
        author: res.data.data.author?.unique_id || 'autor',
        views: res.data.data.play_count || 0,
        likes: res.data.data.digg_count || 0,
        comments: res.data.data.comment_count || 0,
        shares: res.data.data.share_count || 0
      };
    } else {
      console.warn(`[TIKTOK API] POST returned code ${res.data?.code}: ${res.data?.msg || 'No message'}`);
    }
  } catch (postError) {
    console.error('[TIKTOK API ERROR] POST request failed:', postError.message);
  }

  // 2. Fallback: GET request to tikwm.com/api/
  try {
    console.log(`[TIKTOK API] Falling back to GET request to TikWM for: ${resolvedUrl}`);
    const resGet = await axios.get('https://www.tikwm.com/api/', {
      params: { url: resolvedUrl, hd: '0' },
      headers: {
        'User-Agent': userAgent
      },
      timeout: 10000
    });

    if (resGet.data && resGet.data.code === 0 && resGet.data.data) {
      console.log('[TIKTOK API] Successfully fetched video data via GET');
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
    } else {
      throw new Error(resGet.data?.msg || 'Nie udało się pobrać danych o wideo z TikToka (zarówno POST jak i GET zawiodły).');
    }
  } catch (getError) {
    console.error('[TIKTOK API ERROR] GET fallback failed:', getError.message);
    throw getError;
  }
}

/**
 * Downloads a file from the given URL and writes it to the destination path.
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
