const axios = require('axios');

// Cache to avoid refetching the same listings
let lastFetchTime = 0;
let cachedPostsMap = new Map();

/**
 * Fetches a random image post from Reddit subreddits
 * @param {string[]} subreddits - Array of subreddit names
 * @param {string} animalType - Type of animal (for error messages)
 * @returns {Promise<{url: string, title: string, subreddit: string}|null>}
 */
async function fetchRandomRedditImage(subreddits, animalType = 'zwierzę') {
  const maxAttempts = 30;
  
  // Refresh cache every 5 minutes
  const now = Date.now();
  if (now - lastFetchTime > 300000) {
    cachedPostsMap.clear();
    lastFetchTime = now;
  }
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Randomly select a subreddit
      const subreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
      
      const cacheKey = subreddit;
      
      let posts = cachedPostsMap.get(cacheKey);
      
      if (!posts) {
        // Try multiple Reddit domains to avoid blocking
        const domains = ['www.reddit.com', 'old.reddit.com'];
        const domain = domains[Math.floor(Math.random() * domains.length)];
        
        const response = await axios.get(
          `https://${domain}/r/${subreddit}/hot.json?limit=100`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            validateStatus: function(status) { return status < 500; }
          }
        );

        if (response.status !== 200) {
          console.error(`[REDDIT] API returned status ${response.status} for r/${subreddit} on ${domain}`);
          // Don't cache failed responses
          continue;
        }

        posts = response.data?.data?.children || [];
        if (posts.length > 0) {
          cachedPostsMap.set(cacheKey, posts);
        } else {
          continue;
        }
      }
      
      if (posts.length === 0) {
        cachedPostsMap.delete(cacheKey);
        continue;
      }

      // Shuffle posts and find a valid image
      const shuffledPosts = [...posts].sort(() => Math.random() - 0.5);
      
      for (const post of shuffledPosts) {
        const data = post.data;
        
        // Skip removed/deleted/pinned/stickied posts
        if (data.removed_by_category || data.banned_by || data.stickied || !data || !data.url) {
          continue;
        }

        // Skip NSFW posts
        if (data.over_18 || data.spoiler) {
          continue;
        }

        // Skip text posts, videos, galleries
        if (data.is_self || data.is_video) {
          continue;
        }

        const url = (data.url || '').toLowerCase();
        const domain = (data.domain || '').toLowerCase();
        
        // Skip non-image domains
        if (!domain.includes('i.redd.it') && !domain.includes('imgur.com') && 
            !domain.includes('i.imgur.com') && !url.endsWith('.jpg') && 
            !url.endsWith('.jpeg') && !url.endsWith('.png') && !url.endsWith('.webp')) {
          continue;
        }

        // Skip videos, gifs, galleries
        if (domain.includes('v.redd.it') || domain.includes('gfycat.com') || 
            domain.includes('redgifs.com') || domain.includes('youtube.com') || 
            domain.includes('youtu.be') || url.endsWith('.gif') || url.endsWith('.gifv')) {
          continue;
        }

        // Get the image URL - use the direct URL if it's from i.redd.it or i.imgur.com
        let imageUrl = null;
        
        if (data.url_overridden_by_dest) {
          const u = data.url_overridden_by_dest.toLowerCase();
          if (u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp')) {
            imageUrl = data.url_overridden_by_dest;
          }
        }
        
        if (!imageUrl && data.url) {
          const u = data.url.toLowerCase();
          if ((u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp')) &&
              (u.includes('i.redd.it') || u.includes('imgur.com') || u.includes('i.imgur.com'))) {
            imageUrl = data.url;
          }
        }
        
        if (!imageUrl && data.preview && data.preview.images && data.preview.images[0]) {
          const source = data.preview.images[0].source;
          if (source && source.url) {
            // Decode HTML entities and strip query params
            const ampEntity = String.fromCharCode(38) + 'amp;';
            let decoded = source.url.split(ampEntity).join(String.fromCharCode(38));
            // Strip query parameters from preview URLs
            const qIndex = decoded.indexOf('?');
            if (qIndex > 0) {
              decoded = decoded.substring(0, qIndex);
            }
            imageUrl = decoded;
          }
        }
        
        if (!imageUrl) {
          continue;
        }

        // Found a valid image post
        return {
          url: imageUrl,
          title: data.title || `Zdjęcie z ${subreddit}`,
          subreddit: `r/${subreddit}`
        };
      }
    } catch (err) {
      console.error(`[REDDIT] Error fetching ${animalType} (attempt ${attempt + 1}/${maxAttempts}):`, err.message);
      continue;
    }
  }

  // No valid image found after all attempts
  return null;
}

module.exports = {
  fetchRandomRedditImage
};