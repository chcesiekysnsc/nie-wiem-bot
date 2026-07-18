const axios = require('axios');

/**
 * Fetches a random image from a Reddit subreddit
 * @param {string} subreddit - Subreddit name
 * @returns {Promise<string|null>} - Direct image URL or null
 */
async function fetchRedditImage(subreddit) {
  if (subreddit === 'cats') {
    try {
      const response = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 10000 });
      if (response.data && response.data[0] && response.data[0].url) {
        return response.data[0].url;
      }
    } catch (err) {
      console.error('[REDDIT API] Cat API failed, trying Reddit:', err.message);
    }
  }

  if (subreddit === 'rabbits') {
    try {
      const response = await axios.get('https://animals.maxz.dev/api/rabbit/random', { timeout: 10000 });
      if (response.data && response.data.image) {
        return response.data.image;
      }
    } catch (err) {
      console.error('[REDDIT API] Rabbit API failed, trying Reddit:', err.message);
    }
  }

  const maxAttempts = 10;
  let badStatusCount = 0;
  let emptyPostsCount = 0;
  let noCandidateCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        `https://www.reddit.com/r/${subreddit}/top.json?limit=100&t=day`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 15000,
          validateStatus: status => status < 500
        }
      );

      if (response.status !== 200) {
        badStatusCount++;
        console.warn(`[REDDIT] Próba ${attempt + 1}/${maxAttempts}: status ${response.status} dla r/${subreddit}`);
        continue;
      }

      const posts = response.data?.data?.children || [];

      if (posts.length === 0) {
        emptyPostsCount++;
        console.warn(`[REDDIT] Próba ${attempt + 1}/${maxAttempts}: 0 postów dla r/${subreddit}`);
        continue;
      }

      const candidate = findImageCandidate(posts);

      if (candidate) {
        return candidate;
      }

      noCandidateCount++;
      console.warn(`[REDDIT] Próba ${attempt + 1}/${maxAttempts}: brak pasującego obrazka w ${posts.length} postach r/${subreddit}`);
    } catch (err) {
      console.error(`[REDDIT] Attempt ${attempt + 1}/${maxAttempts} failed:`, err.message);
      continue;
    }
  }

  console.warn(
    `[REDDIT] Brak wyników z t=day dla r/${subreddit}, próbuję t=week jako fallback...`
  );

  let weekBadStatusCount = 0;
  let weekEmptyPostsCount = 0;
  let weekNoCandidateCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        `https://www.reddit.com/r/${subreddit}/top.json?limit=100&t=week`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 15000,
          validateStatus: status => status < 500
        }
      );

      if (response.status !== 200) {
        weekBadStatusCount++;
        console.warn(`[REDDIT][fallback t=week] Próba ${attempt + 1}/${maxAttempts}: status ${response.status} dla r/${subreddit}`);
        continue;
      }

      const posts = response.data?.data?.children || [];

      if (posts.length === 0) {
        weekEmptyPostsCount++;
        console.warn(`[REDDIT][fallback t=week] Próba ${attempt + 1}/${maxAttempts}: 0 postów dla r/${subreddit}`);
        continue;
      }

      const candidate = findImageCandidate(posts);

      if (candidate) {
        return candidate;
      }

      weekNoCandidateCount++;
      console.warn(`[REDDIT][fallback t=week] Próba ${attempt + 1}/${maxAttempts}: brak pasującego obrazka w ${posts.length} postach r/${subreddit}`);
    } catch (err) {
      console.error(`[REDDIT][fallback t=week] Attempt ${attempt + 1}/${maxAttempts} failed:`, err.message);
      continue;
    }
  }

  console.warn(
    `[REDDIT] Wyczerpiono wszystkie próby (${maxAttempts} x t=day + ${maxAttempts} x t=week) dla r/${subreddit}: ` +
    `t=day: ${badStatusCount} z błędnym statusem, ${emptyPostsCount} z 0 postami, ${noCandidateCount} bez pasujących obrazków. ` +
    `t=week: ${weekBadStatusCount} z błędnym statusem, ${weekEmptyPostsCount} z 0 postami, ${weekNoCandidateCount} bez pasujących obrazków.`
  );

  return null;
}

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;

  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  const ext = pathname.toLowerCase().split('.').pop() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return true;
  }

  return false;
}

function isTrustedImageDomain(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return lower.includes('i.redd.it') || lower.includes('i.imgur.com') || lower.includes('preview.redd.it');
}

function findImageCandidate(posts) {
  const shuffled = [...posts].sort(() => Math.random() - 0.5);

  for (const post of shuffled) {
    const data = post.data;
    if (!data || data.stickied || data.over_18 || data.spoiler || data.is_self || data.is_video) {
      continue;
    }

    const url = data.url_overridden_by_dest || data.url || '';
    if (!url) continue;

    if (data.post_hint === 'image') {
      return url;
    }

    if (isTrustedImageDomain(url)) {
      return url;
    }

    if (isImageUrl(url)) {
      return url;
    }

    if (data.is_gallery && data.gallery_media && data.media_metadata) {
      const firstKey = Object.keys(data.gallery_media)[0];
      if (firstKey && data.media_metadata[firstKey] && data.media_metadata[firstKey].s && data.media_metadata[firstKey].s.u) {
        return data.media_metadata[firstKey].s.u;
      }
    }
  }

  return null;
}

module.exports = { fetchRedditImage };
