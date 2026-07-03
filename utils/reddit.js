const axios = require('axios');

/**
 * Fetches a random image post from Reddit subreddits
 * @param {string[]} subreddits - Array of subreddit names
 * @param {string} animalType - Type of animal (for error messages)
 * @returns {Promise<{url: string, title: string, subreddit: string}|null>}
 */
async function fetchRandomRedditImage(subreddits, animalType = 'zwierzę') {
  const maxAttempts = 10;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Randomly select a subreddit
      const subreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
      
      // Fetch posts from Reddit API
      const response = await axios.get(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=50`,
        {
          headers: {
            'User-Agent': 'MessengerBot/1.0 (by /u/bot)'
          },
          timeout: 10000
        }
      );

      const posts = response.data?.data?.children || [];
      
      if (posts.length === 0) {
        continue;
      }

      // Shuffle posts and find a valid image
      const shuffledPosts = posts.sort(() => Math.random() - 0.5);
      
      for (const post of shuffledPosts) {
        const data = post.data;
        
        // Skip NSFW posts
        if (data.over_18 || data.spoiler) {
          continue;
        }

        // Skip removed/deleted posts
        if (data.removed_by_category || data.banned_by) {
          continue;
        }

        // Skip text posts
        if (data.is_self || !data.url) {
          continue;
        }

        const url = data.url.toLowerCase();
        
        // Check if it's an image
        const isImage = url.endsWith('.jpg') || 
                       url.endsWith('.jpeg') || 
                       url.endsWith('.png') || 
                       url.endsWith('.webp') ||
                       url.includes('i.redd.it') ||
                       url.includes('i.imgur.com');
        
        // Skip videos, gifs, galleries, external links
        const isVideo = data.is_video || url.includes('v.redd.it') || url.includes('youtube.com') || url.includes('youtu.be');
        const isGallery = data.media_metadata && Object.keys(data.media_metadata).length > 0;
        const isGif = url.endsWith('.gif') || url.includes('gfycat.com');
        const isExternalLink = !url.includes('reddit.com') && !url.includes('i.redd.it') && !url.includes('i.imgur.com') && !url.includes('imgur.com');
        
        if (isVideo || isGallery || isGif || isExternalLink || !isImage) {
          continue;
        }

        // Found a valid image post
        return {
          url: data.url,
          title: data.title || `Losowe zdjęcie ${animalType} z r/${subreddit}`,
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