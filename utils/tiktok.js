const axios = require('axios');
const fs = require('fs');

let puppeteerReady = false;
let puppeteerError = null;
let puppeteerBrowser = null;

async function ensurePuppeteer() {
  if (puppeteerReady) return puppeteerBrowser;
  if (puppeteerError) throw puppeteerError;
  try {
    const puppeteer = require('puppeteer');
    puppeteerBrowser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    puppeteerReady = true;
    return puppeteerBrowser;
  } catch (err) {
    puppeteerError = err;
    throw err;
  }
}

/**
 * Extracts the first TikTok link from text.
 * Supports: www.tiktok.com, tiktok.com, vm.tiktok.com, vt.tiktok.com, v.tiktok.com
 * @param {string} text 
 * @returns {string|null}
 */
function extractTikTokLink(text) {
  if (typeof text !== 'string') return null;
  
  // Match all TikTok URL patterns
  const patterns = [
    /https?:\/\/(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.-]+\/video\/\d+\/?/i,
    /https?:\/\/(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9_-]+\/?/i,
    /https?:\/\/(?:www\.)?tiktok\.com\/v\/[A-Za-z0-9_-]+\/?/i,
    /https?:\/\/vm\.tiktok\.com\/[A-Za-z0-9_-]+\/?/i,
    /https?:\/\/vt\.tiktok\.com\/[A-Za-z0-9_-]+\/?/i,
    /https?:\/\/v\.tiktok\.com\/[A-Za-z0-9_-]+\/?/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  
  return null;
}

/**
 * Resolves redirects for shortened TikTok URLs.
 * @param {string} url 
 * @returns {Promise<string>}
 */
async function resolveRedirect(url) {
  if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com') || url.includes('v.tiktok.com')) {
    try {
      console.log(`[TIKTOK RESOLVER] Resolving redirect for: ${url}`);
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
      console.error('[TIKTOK RESOLVER ERROR]', err.message);
      return url;
    }
  }
  return url;
}

/**
 * Fetches TikTok video data using multiple API services.
 * @param {string} videoUrl 
 * @returns {Promise<{playUrl: string, title: string, size: number, author: string, views: number, likes: number, comments: number, shares: number}>}
 */
async function getTikTokVideoData(videoUrl) {
  const resolvedUrl = await resolveRedirect(videoUrl);
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Try multiple API services
  const services = [
    {
      name: 'TikWM',
      fetch: async (url) => {
        const params = new URLSearchParams();
        params.append('url', url);
        params.append('hd', '0');
        
        const res = await axios.post('https://www.tikwm.com/api/', params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': userAgent
          },
          timeout: 10000
        });
        
        console.log(`[TIKTOK API] TikWM POST response for ${url}:`, JSON.stringify(res.data).substring(0, 500));
        
        if (res.data?.code === 0 && res.data?.data) {
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
        }
        throw new Error(`TikWM error: ${res.data?.msg || 'API returned error'} | code=${res.data?.code}`);
      }
    },
    {
      name: 'TikWM GET',
      fetch: async (url) => {
        const res = await axios.get('https://www.tikwm.com/api/', {
          params: { url, hd: '0' },
          headers: { 'User-Agent': userAgent },
          timeout: 10000
        });
        
        console.log(`[TIKTOK API] TikWM GET response for ${url}:`, JSON.stringify(res.data).substring(0, 500));
        
        if (res.data?.code === 0 && res.data?.data) {
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
        }
        throw new Error(`TikWM error: ${res.data?.msg || 'API returned error'} | code=${res.data?.code}`);
      }
    },
    {
      name: 'TikWM v2',
      fetch: async (url) => {
        const res = await axios.get('https://www.tikwm.com/api/', {
          params: { url, count: '12', cursor: '0', hd: '1' },
          headers: { 'User-Agent': userAgent },
          timeout: 10000
        });
        
        console.log(`[TIKTOK API] TikWM v2 response for ${url}:`, JSON.stringify(res.data).substring(0, 500));
        
        if (res.data?.code === 0 && res.data?.data) {
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
        }
        throw new Error(`TikWM v2 error: ${res.data?.msg || 'API returned error'} | code=${res.data?.code}`);
      }
    }
  ];

  for (const service of services) {
    try {
      console.log(`[TIKTOK API] Trying ${service.name} for: ${resolvedUrl}`);
      const data = await service.fetch(resolvedUrl);
      console.log(`[TIKTOK API] Success with ${service.name}`);
      return data;
    } catch (err) {
      console.error(`[TIKTOK API ERROR] ${service.name} failed:`, err);
    }
  }

  console.log('[TIKTOK API] All API services failed, trying Puppeteer scraper...');
  try {
    const data = await fetchViaPuppeteer(resolvedUrl);
    console.log('[TIKTOK API] Success with Puppeteer scraper');
    return data;
  } catch (err) {
    console.error('[TIKTOK API ERROR] Puppeteer scraper failed:', err);
  }

  throw new Error('Nie udało się pobrać danych o wideo z TikToka. Wszystkie serwisy API zawiodły.');
}

async function fetchViaPuppeteer(videoUrl) {
  const browser = await ensurePuppeteer();
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    let playUrl = '';
    try {
      await page.waitForSelector('video', { timeout: 10000 });
      playUrl = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video ? (video.src || video.querySelector('source')?.src || '') : '';
      });
    } catch (_) {}

    if (!playUrl) {
      try {
        await page.evaluate(() => window.scrollBy(0, 200));
        await new Promise(r => setTimeout(r, 1000));
        playUrl = await page.evaluate(() => {
          const video = document.querySelector('video');
          return video ? (video.src || video.querySelector('source')?.src || '') : '';
        });
      } catch (_) {}
    }

    if (!playUrl) {
      try {
        const jsonScript = document.querySelector('script[id="__NEXT_DATA__"]') || document.querySelector('script[type="application/json"]');
        if (jsonScript) {
          const json = JSON.parse(jsonScript.textContent || '{}');
          const walk = (obj) => {
            if (typeof obj !== 'object' || obj === null) return '';
            if (obj.playUrl || obj.play_addr || obj.video?.play_addr) return obj.playUrl || obj.play_addr || obj.video?.play_addr;
            if (Array.isArray(obj)) {
              for (const item of obj) { const r = walk(item); if (r) return r; }
            } else {
              for (const key of Object.keys(obj)) { const r = walk(obj[key]); if (r) return r; }
            }
            return '';
          };
          playUrl = walk(json);
        }
      } catch (_) {}
    }

    const title = await page.title().catch(() => 'Wideo z TikToka');
    const author = await page.evaluate(() => {
      const el = document.querySelector('span[data-e2e="video-author-name"]') || document.querySelector('.tiktok-1r8q6do-SpanAuthor') || document.querySelector('a[href*="/@"]');
      return el ? (el.textContent || '').replace(/^@/, '') : 'autor';
    }).catch(() => 'autor');

    await page.close();

    const resolvedPlayUrl = (playUrl || '').trim();
    if (!resolvedPlayUrl) {
      throw new Error('Nie znaleziono adresu wideo na stronie TikToka.');
    }

    return {
      playUrl: resolvedPlayUrl,
      title: title || 'Wideo z TikToka',
      size: 0,
      author: author || 'autor',
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0
    };
  } catch (err) {
    try { await page.close(); } catch (_) {}
    throw err;
  }
}

/**
 * Downloads a file from the given URL and writes it to the destination path.
 * @param {string} url 
 * @param {string} destPath 
 * @returns {Promise<void>}
 */
async function downloadFile(url, destPath) {
  console.log(`[TIKTOK DOWNLOAD] Pobieranie z: ${url}`);
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.tiktok.com/'
    }
  });

  return new Promise((resolve, reject) => {
    const streamError = (err) => {
      writer.removeAllListeners();
      try { writer.close(); } catch (_) {}
      if (!writer.destroyed) writer.destroy();
      try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}
      const msg = err && typeof err === 'object' ? (err.message || String(err)) : String(err);
      reject(new Error(`Nie udało się pobrać pliku z TikToka: ${msg}`));
    };

    writer.on('finish', () => {
      writer.removeAllListeners();
      try {
        const stats = fs.statSync(destPath);
        if (!stats.isFile() || stats.size === 0) {
          try { fs.unlinkSync(destPath); } catch (_) {}
          return reject(new Error('Pobrany plik jest pusty lub nie istnieje.'));
        }
        console.log(`[TIKTOK DOWNLOAD] Pobrano plik: ${destPath} (${stats.size} bajtów)`);
        resolve();
      } catch (err) {
        reject(new Error(`Nie udało się zweryfikować pobranego pliku: ${err.message}`));
      }
    });
    writer.on('error', streamError);

    response.data.on('error', streamError);
    response.data.pipe(writer);
  });
}

module.exports = {
  extractTikTokLink,
  getTikTokVideoData,
  downloadFile,
  fetchViaPuppeteer
};
