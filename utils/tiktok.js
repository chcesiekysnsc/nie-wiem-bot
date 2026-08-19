const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const YtDlp = require('yt-dlp-wrap').default;

const execFileAsync = promisify(execFile);

function extractTikTokLink(text) {
  if (typeof text !== 'string') return null;

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

async function getVideoInfoWithYtDlp(videoUrl) {
  const ytDlp = new YtDlp();
  const info = await ytDlp.getVideoInfo(videoUrl, {
    dumpJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    quiet: true
  });

  const directUrl = info.url || info.formats?.find(f => f.ext === 'mp4' && f.acodec !== 'none')?.url || info.formats?.[0]?.url;
  if (!directUrl) {
    throw new Error('Nie znaleziono bezpośredniego linku do wideo.');
  }

  return {
    playUrl: directUrl,
    title: info.title || 'Wideo z TikToka',
    size: 0,
    author: info.uploader || info.channel || 'autor',
    views: info.view_count || 0,
    likes: info.like_count || 0,
    comments: 0,
    shares: 0
  };
}

async function getVideoInfoWithTikWM(videoUrl) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const services = [
    {
      name: 'TikWM POST',
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
    }
  ];

  for (const service of services) {
    try {
      console.log(`[TIKTOK API] Trying ${service.name} for: ${videoUrl}`);
      const data = await service.fetch(videoUrl);
      console.log(`[TIKTOK API] Success with ${service.name}`);
      return data;
    } catch (err) {
      console.error(`[TIKTOK API ERROR] ${service.name} failed:`, err.message);
    }
  }

  throw new Error('TikWM services failed');
}

async function getTikTokVideoData(videoUrl) {
  const resolvedUrl = await resolveRedirect(videoUrl);

  console.log('[TIKTOK] Trying yt-dlp...');
  try {
    const data = await getVideoInfoWithYtDlp(resolvedUrl);
    console.log('[TIKTOK] Success with yt-dlp');
    return data;
  } catch (err) {
    console.error('[TIKTOK] yt-dlp failed:', err.message);
  }

  console.log('[TIKTOK] Trying TikWM fallback...');
  try {
    const data = await getVideoInfoWithTikWM(resolvedUrl);
    return data;
  } catch (err) {
    console.error('[TIKTOK] TikWM fallback failed:', err.message);
  }

  throw new Error('Nie udało się pobrać danych o wideo z TikToka. Wszystkie serwisy zawiodły.');
}

async function downloadVideoWithYtDlp(videoUrl, destPath) {
  console.log(`[TIKTOK YT-DLP] Downloading to: ${destPath}`);
  const ytDlp = new YtDlp();

  await ytDlp.execPromise([
    videoUrl,
    '-f', 'best[ext=mp4]/best',
    '-o', destPath,
    '--no-warnings',
    '--quiet',
    '--no-check-certificates'
  ]);

  const stats = fs.statSync(destPath);
  if (!stats.isFile() || stats.size === 0) {
    try { fs.unlinkSync(destPath); } catch (_) {}
    throw new Error('Pobrany plik jest pusty lub nie istnieje.');
  }

  console.log(`[TIKTOK YT-DLP] Downloaded: ${destPath} (${stats.size} bytes)`);
  return stats.size;
}

module.exports = {
  extractTikTokLink,
  getTikTokVideoData,
  downloadVideoWithYtDlp
};
