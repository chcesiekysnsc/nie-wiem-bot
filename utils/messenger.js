const crypto = require('crypto');

const { loadData, withData } = require('./storage');

const PROFILE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const PROCESSED_MESSAGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TEXT_LIMIT = 1800;

function normalizeLineEndings(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function stripFormatting(value) {
  return normalizeLineEndings(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/<@(\d+)>/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

class EmbedBuilder {
  constructor() {
    this.data = {
      fields: []
    };
  }

  setColor(color) {
    this.data.color = color;
    return this;
  }

  setTitle(title) {
    this.data.title = title;
    return this;
  }

  setDescription(description) {
    this.data.description = description;
    return this;
  }

  addFields(...fields) {
    const normalized = fields.flat().filter(Boolean).map(field => ({
      name: String(field.name || '').trim(),
      value: String(field.value || '').trim(),
      inline: Boolean(field.inline)
    }));

    this.data.fields.push(...normalized);
    return this;
  }

  setThumbnail(url) {
    this.data.thumbnail = url || '';
    return this;
  }

  setAuthor(author) {
    this.data.author = author || null;
    return this;
  }

  setFooter(footer) {
    this.data.footer = footer || null;
    return this;
  }

  setTimestamp(timestamp = new Date()) {
    this.data.timestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return this;
  }

  toMessageText() {
    const lines = [];

    if (this.data.author?.name) {
      lines.push(stripFormatting(this.data.author.name));
    }

    if (this.data.title) {
      lines.push(stripFormatting(this.data.title));
    }

    if (this.data.description) {
      lines.push(stripFormatting(this.data.description));
    }

    for (const field of this.data.fields) {
      if (!field.name && !field.value) {
        continue;
      }

      if (!field.name) {
        lines.push(stripFormatting(field.value));
        continue;
      }

      lines.push(`${stripFormatting(field.name)}: ${stripFormatting(field.value)}`);
    }

    if (this.data.footer?.text) {
      lines.push(stripFormatting(this.data.footer.text));
    }

    return lines.filter(Boolean).join('\n\n').trim();
  }
}

function renderPayloadToText(payload) {
  if (!payload) {
    return '';
  }

  if (typeof payload === 'string') {
    return stripFormatting(payload);
  }

  if (payload.text) {
    return stripFormatting(payload.text);
  }

  if (payload.content) {
    return stripFormatting(payload.content);
  }

  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
  const parts = embeds
    .map(embed => (typeof embed?.toMessageText === 'function' ? embed.toMessageText() : stripFormatting(embed)))
    .filter(Boolean);

  return parts.join('\n\n').trim();
}

function chunkText(text, limit = DEFAULT_TEXT_LIMIT) {
  const normalized = normalizeLineEndings(text);

  if (!normalized) {
    return [];
  }

  if (normalized.length <= limit) {
    return [normalized];
  }

  const chunks = [];
  const paragraphs = normalized.split('\n\n');
  let buffer = '';

  const flush = () => {
    if (!buffer) {
      return;
    }

    chunks.push(buffer);
    buffer = '';
  };

  const append = paragraph => {
    if (!buffer) {
      buffer = paragraph;
      return;
    }

    const candidate = `${buffer}\n\n${paragraph}`;
    if (candidate.length <= limit) {
      buffer = candidate;
      return;
    }

    flush();
    buffer = paragraph;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length <= limit) {
      append(paragraph);
      continue;
    }

    flush();

    let start = 0;
    while (start < paragraph.length) {
      chunks.push(paragraph.slice(start, start + limit));
      start += limit;
    }
  }

  flush();
  return chunks;
}

function defaultProfileName(userId) {
  const suffix = String(userId || '').slice(-6) || 'unknown';
  return `User ${suffix}`;
}

function sanitizeProfile(profile, userId) {
  const safeId = String(userId || profile?.id || '');
  const firstName = typeof profile?.firstName === 'string' ? profile.firstName.trim().slice(0, 40) : '';
  const lastName = typeof profile?.lastName === 'string' ? profile.lastName.trim().slice(0, 40) : '';
  const composedName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const name = typeof profile?.name === 'string' ? profile.name.trim().slice(0, 80) : composedName;
  const shortName = typeof profile?.shortName === 'string' ? profile.shortName.trim().slice(0, 40) : '';
  const avatarUrl = typeof profile?.avatarUrl === 'string' ? profile.avatarUrl.trim() : '';
  const updatedAt = Number.isFinite(Number(profile?.updatedAt)) ? Number(profile.updatedAt) : 0;

  const resolvedName = name || composedName || shortName || defaultProfileName(safeId);
  const resolvedShortName = shortName || firstName || resolvedName;

  return {
    id: safeId,
    platform: 'messenger',
    firstName,
    lastName,
    name: resolvedName,
    shortName: resolvedShortName,
    avatarUrl,
    updatedAt
  };
}

function createPlatformUser(userId, profile = {}) {
  const safeProfile = sanitizeProfile(profile, userId);
  const displayLabel = safeProfile.name ? `${safeProfile.name} (${safeProfile.id})` : safeProfile.id;

  return {
    id: safeProfile.id,
    bot: false,
    username: safeProfile.shortName,
    tag: displayLabel,
    profile: safeProfile,
    displayAvatarURL() {
      return safeProfile.avatarUrl || '';
    },
    toString() {
      return displayLabel;
    }
  };
}

function extractUserId(input) {
  const value = String(input || '').trim();

  if (!value) {
    return null;
  }

  if (value.toLowerCase() === 'me') {
    return 'me';
  }

  const match = value.match(/\d{8,32}/);
  return match ? match[0] : null;
}

async function saveProfile(userId, profile) {
  return withData(store => {
    const current = sanitizeProfile(store.profiles[userId], userId);
    const next = sanitizeProfile(
      {
        ...current,
        ...profile
      },
      userId
    );

    store.profiles[userId] = next;
    return next;
  });
}

function getStoredProfile(userId) {
  const profiles = loadData('profiles');
  return profiles[userId] ? sanitizeProfile(profiles[userId], userId) : null;
}

function buildGraphUrl(version, path, query) {
  const base = `https://graph.facebook.com/${version}/${path.replace(/^\/+/, '')}`;
  const search = new URLSearchParams(query);
  return `${base}?${search.toString()}`;
}

function createMessengerClient(clientConfig) {
  const config = clientConfig;
  const pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN?.trim() || '';
  const graphVersion = process.env.MESSENGER_GRAPH_VERSION?.trim() || config.messenger.graphVersion;
  const pageId = process.env.MESSENGER_PAGE_ID?.trim() || config.messenger.pageId;
  const appSecret = process.env.MESSENGER_APP_SECRET?.trim() || '';

  const client = {
    config,
    commands: new Map(),
    marriageRequests: new Map(),
    processedMessages: new Map(),
    users: {
      cache: new Map(),
      fetch: async userId => client.fetchUser(userId)
    },
    user: createPlatformUser(
      pageId || 'page',
      {
        name: config.casinoName,
        shortName: config.casinoName,
        avatarUrl: config.messenger.botAvatarUrl,
        updatedAt: Date.now()
      }
    )
  };

  function cleanupProcessedMessages() {
    const now = Date.now();

    for (const [messageId, expiresAt] of client.processedMessages.entries()) {
      if (expiresAt <= now) {
        client.processedMessages.delete(messageId);
      }
    }
  }

  client.markProcessed = messageId => {
    if (!messageId) {
      return;
    }

    cleanupProcessedMessages();
    client.processedMessages.set(messageId, Date.now() + PROCESSED_MESSAGE_TTL_MS);
  };

  client.isProcessed = messageId => {
    if (!messageId) {
      return false;
    }

    cleanupProcessedMessages();
    return client.processedMessages.has(messageId);
  };

  client.verifySignature = (signatureHeader, bodyBuffer) => {
    if (!appSecret) {
      return true;
    }

    if (!signatureHeader) {
      return false;
    }

    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(bodyBuffer).digest('hex')}`;
    const provided = String(signatureHeader).trim();

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    } catch (error) {
      return false;
    }
  };

  client.getSendApiUrls = () => {
    const urls = [];

    if (pageId) {
      urls.push(buildGraphUrl(graphVersion, `${pageId}/messages`, {
        access_token: pageAccessToken
      }));
    }

    urls.push(buildGraphUrl(graphVersion, 'me/messages', {
      access_token: pageAccessToken
    }));

    return [...new Set(urls)];
  };

  client.sendPayload = async body => {
    if (!pageAccessToken) {
      throw new Error('Missing MESSENGER_PAGE_ACCESS_TOKEN in environment variables.');
    }

    let lastError = null;

    for (const url of client.getSendApiUrls()) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        return response.json().catch(() => ({}));
      }

      const raw = await response.text();
      lastError = new Error(`Messenger Send API ${response.status}: ${raw}`);
    }

    throw lastError || new Error('Messenger Send API request failed.');
  };

  client.sendText = async (recipientId, payload, messagingType = 'UPDATE') => {
    const text = renderPayloadToText(payload);

    if (!text) {
      return null;
    }

    let result = null;

    for (const chunk of chunkText(text)) {
      result = await client.sendPayload({
        messaging_type: messagingType,
        recipient: { id: recipientId },
        message: { text: chunk }
      });
    }

    return result;
  };

  client.fetchProfile = async userId => {
    if (!pageAccessToken) {
      return null;
    }

    const response = await fetch(buildGraphUrl(graphVersion, userId, {
      fields: 'first_name,last_name,profile_pic',
      access_token: pageAccessToken
    }));

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return sanitizeProfile(
      {
        firstName: data.first_name,
        lastName: data.last_name,
        name: [data.first_name, data.last_name].filter(Boolean).join(' ').trim(),
        shortName: data.first_name || data.name,
        avatarUrl: data.profile_pic || '',
        updatedAt: Date.now()
      },
      userId
    );
  };

  client.getUser = userId => {
    const normalizedId = String(userId || '').trim();

    if (!normalizedId) {
      return null;
    }

    const cached = client.users.cache.get(normalizedId);
    if (cached) {
      return cached;
    }

    const storedProfile = getStoredProfile(normalizedId);
    const user = createPlatformUser(normalizedId, storedProfile || {});
    client.users.cache.set(normalizedId, user);
    return user;
  };

  client.cacheUser = async userId => {
    const normalizedId = String(userId || '').trim();

    if (!normalizedId) {
      return null;
    }

    const storedProfile = getStoredProfile(normalizedId);
    const shouldRefresh = !storedProfile || !storedProfile.name || Date.now() - storedProfile.updatedAt > PROFILE_REFRESH_MS;
    let profile = storedProfile;

    if (shouldRefresh) {
      const remoteProfile = await client.fetchProfile(normalizedId).catch(() => null);
      if (remoteProfile) {
        profile = await saveProfile(normalizedId, remoteProfile);
      }
    }

    const user = createPlatformUser(normalizedId, profile || {});
    client.users.cache.set(normalizedId, user);
    return user;
  };

  client.fetchUser = async userId => {
    const cached = client.getUser(userId);

    if (cached && cached.profile.updatedAt) {
      return cached;
    }

    return client.cacheUser(userId);
  };

  return client;
}

function createMessageContext(client, senderUser, text, args, event, pageId) {
  const firstUserLikeToken = args
    .map(extractUserId)
    .find(candidate => candidate && candidate !== 'me') || null;

  return {
    client,
    author: senderUser,
    content: text,
    guild: {
      id: pageId ? `page:${pageId}` : 'messenger'
    },
    rawEvent: event,
    mentions: {
      users: {
        first: () => (firstUserLikeToken ? client.getUser(firstUserLikeToken) : null)
      }
    },
    reply: payload => client.sendText(senderUser.id, payload, 'RESPONSE')
  };
}

module.exports = {
  EmbedBuilder,
  chunkText,
  createMessageContext,
  createMessengerClient,
  createPlatformUser,
  extractUserId,
  renderPayloadToText,
  sanitizeProfile,
  stripFormatting
};
