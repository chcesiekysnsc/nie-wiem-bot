const axios = require('axios');

/**
 * Fetches a random image from a Reddit subreddit
 * @param {string} subreddit - Subreddit name
 * @returns {Promise<string|null>} - Direct image URL or null
 */
async function fetchRedditImage(subreddit) {
  const maxAttempts = 10;

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
        continue;
      }

      const posts = response.data?.data?.children || [];

      if (posts.length === 0) {
        continue;
      }

      // Shuffle and pick a random post
      const shuffled = [...posts].sort(() => Math.random() - 0.5);

      for (const post of shuffled) {
        const data = post.data;

        if (!data || data.stickied || data.over_18 || data.spoiler || data.is_self || data.is_video) {
          continue;
        }

        const url = data.url_overridden_by_dest || data.url || '';
        const lower = url.toLowerCase();

        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
          return url;
        }
      }
    } catch (err) {
      console.error(`[REDDIT] Attempt ${attempt + 1}/${maxAttempts} failed:`, err.message);
      continue;
    }
  }

  return null;
}

module.exports = { fetchRedditImage };