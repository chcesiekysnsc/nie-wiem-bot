const axios = require('axios');

// Cache to avoid refetching the same listings
let lastFetchTime = 0;
let cachedPostsMap = new Map();

function decodeHtmlEntities(str) {
  const entities = {
    'amp': '&',
    'lt': '<',
    'gt': '>',
    'quot': '"',
    '#x27': "'"
  };
  return str.replace(/&([^;]+);/g, function(match, entity) {
    return entities[entity] || match;
  });
}

function getImageUrl(data) {
  // Priority 1: url_overridden_by_dest (the actual media URL)
  if (data.url_overridden_by_dest) {
    const u = data.url_overridden_by_dest.toLowerCase();
    if (u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp')) {
      return data.url_overridden_by_dest;
    }
  }
  // Priority 2: preview images (highest resolution)
  if (data.preview && data.preview.images && data.preview.images[0]) {
    const source = data.preview.images[0].source;
    if (source && source.url) {
      const decodedUrl = decodeHtmlEntities(source.url);
      if (decodedUrl.endsWith('.jpg') || decodedUrl.endsWith('.jpeg') || 
          decodedUrl.endsWith('.png') || decodedUrl.endsWith('.webp')) {
        return decodedUrl;
      }
    }
    // Try resolutions
    const resolutions = data.preview.images[0].resolutions;
    if (resolutions && resolutions.length > 0) {
      const bestRes = resolutions[resolutions.length - 1];
      if (bestRes && bestRes.url) {
        const decodedUrl = decodeHtmlEntities(bestRes.url);
        if (decodedUrl.endsWith('.jpg') || decodedUrl.endsWith('.jpeg') || 
            decodedUrl.endsWith('.png') || decodedUrl.endsWith('.webp')) {
          return decodedUrl;
        }
      }
    }
  }
  // Priority 3: direct URL if it's an image host
  if (data.url) {
    const u = data.url.toLowerCase();
    if ((u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp')) &&
        (u.includes('i.redd.it') || u.includes('imgur.com') || u.includes('i.imgur.com'))) {
      return data.url;
    }
  }
  return null;
}

/**
 * Fetches a random image post from Reddit subreddits
 * @param {string[]} subreddits - Array of subreddit names
 * @param {string} animalType - Type of animal (for error messages)
 * @returns {Promise<{url: string, title: string, subreddit: string}|null>}
 */
async function fetchRandomRedditImage(subreddits, animalType = 'zwierzę') {
  const maxAttempts = 50;
  
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
      
      // Randomly select listing type: hot, new, top, rising
      const listings = ['hot', 'new', 'top', 'rising'];
      const listing = listings[Math.floor(Math.random() * listings.length)];
      
      const cacheKey = `${subreddit}_${listing}`;
      
      let posts = cachedPostsMap.get(cacheKey);
      
      if (!posts) {
        // Fetch posts from Reddit API
        const response = await axios.get(
          `https://www.reddit.com/r/${subreddit}/${listing}.json?limit=100`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
          }
        );

        posts = response.data?.data?.children || [];
        cachedPostsMap.set(cacheKey, posts);
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

        // Get the actual image URL
        const imageUrl = getImageUrl(data);
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