const axios = require('axios');

/**
 * Fetches a random image from Reddit
 * @param {string} type - 'rabbit' or 'kitten'
 * @returns {Promise<string|null>} - Direct image URL or null
 */
async function fetchRedditImage(type) {
  const subreddits = type === 'rabbit' 
    ? ['rabbits', 'Bunnies', 'aww']
    : ['IllegallySmolCats', 'cats', 'aww'];
  
  const maxAttempts = 10;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Pick random subreddit
      const subreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
      
      // Use random.json for a truly random post
      const response = await axios.get(
        `https://www.reddit.com/r/${subreddit}/random.json`,
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

      // random.json returns an array with 1 element on success
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      const post = data?.data?.children?.[0]?.data;
      
      if (!post || !post.url) {
        continue;
      }

      // Skip stickied, NSFW, removed, text posts, video posts
      if (post.stickied || post.over_18 || post.spoiler || 
          post.removed_by_category || post.banned_by ||
          post.is_self || post.is_video) {
        continue;
      }

      const url = (post.url || '').toLowerCase();
      const domain = (post.domain || '').toLowerCase();

      // Accept direct image URLs from Reddit or Imgur
      const isDirectImage = domain.includes('i.redd.it') || 
                            domain.includes('preview.redd.it') ||
                            url.endsWith('.jpg') || 
                            url.endsWith('.jpeg') || 
                            url.endsWith('.png') || 
                            url.endsWith('.webp');

      if (!isDirectImage) {
        continue;
      }

      // Clean preview URL: remove query params
      let imageUrl = post.url;
      const qIndex = imageUrl.indexOf('?');
      if (qIndex > 0) {
        imageUrl = imageUrl.substring(0, qIndex);
      }

      return imageUrl;
    } catch (err) {
      console.error(`[REDDIT] Attempt ${attempt + 1}/${maxAttempts} failed:`, err.message);
      continue;
    }
  }

  return null;
}

module.exports = { fetchRedditImage };