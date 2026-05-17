const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

require('dotenv').config();

const config = require('./config/config');
const { ensureDataFiles } = require('./utils/storage');
const { checkCooldown, checkSpam } = require('./utils/cooldowns');
const { errorEmbed } = require('./utils/embeds');
const { createMessageContext, createMessengerClient } = require('./utils/messenger');

const client = createMessengerClient(config);
client.config = config;

function loadCommands() {
  const folderPath = path.join(__dirname, 'commands');
  const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);

    if (!command.name || typeof command.execute !== 'function') {
      console.warn(`[WARN] Invalid command file: ${file}`);
      continue;
    }

    client.commands.set(command.name, command);

    for (const alias of command.aliases || []) {
      client.commands.set(alias, command);
    }
  }
}

async function executeCommand(event, pageId) {
  if (event.message?.is_echo) {
    return;
  }

  const senderId = event.sender?.id;
  const text = String(event.message?.text || '').trim();

  if (!senderId || !text) {
    return;
  }

  const senderUser = await client.cacheUser(senderId);

  if (!text.startsWith(client.config.prefix)) {
    return;
  }

  const args = text.slice(client.config.prefix.length).trim().split(/\s+/).filter(Boolean);
  const commandName = (args.shift() || '').toLowerCase();

  if (!commandName) {
    return;
  }

  const command = client.commands.get(commandName);
  const message = createMessageContext(client, senderUser, text, args, event, pageId);

  if (!command) {
    await message.reply({
      embeds: [errorEmbed('Nieznana komenda', `Komenda \`${commandName}\` nie istnieje.`)]
    }).catch(() => null);
    return;
  }

  try {
    const spamState = await checkSpam(senderId);
    if (spamState.blocked) {
      await message.reply({ embeds: [spamState.embed] }).catch(() => null);
      return;
    }

    const cooldownState = await checkCooldown(command.name, senderId);
    if (cooldownState.active) {
      await message.reply({ embeds: [cooldownState.embed] }).catch(() => null);
      return;
    }

    await command.execute(client, message, args);
  } catch (error) {
    console.error(`[COMMAND] ${commandName} failed:`, error);
    await message.reply({
      embeds: [errorEmbed('Blad komendy', 'Wystapil nieoczekiwany problem podczas wykonywania komendy.')]
    }).catch(() => null);
  }
}

async function handleWebhookPayload(payload) {
  if (!payload || payload.object !== 'page') {
    return;
  }

  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      const messageId = event.message?.mid;

      if (client.isProcessed(messageId)) {
        continue;
      }

      client.markProcessed(messageId);
      await executeCommand(event, event.recipient?.id || entry.id);
    }
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}

function createServer() {
  const port = Number(process.env.PORT || config.messenger.port || 3000);
  const webhookPath = config.messenger.webhookPath || '/webhook';
  const verifyToken = process.env.MESSENGER_VERIFY_TOKEN?.trim() || '';

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === webhookPath) {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === verifyToken) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(challenge || '');
        return;
      }

      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid verify token.');
      return;
    }

    if (req.method === 'POST' && url.pathname === webhookPath) {
      try {
        const rawBody = await readRawBody(req);

        if (!client.verifySignature(req.headers['x-hub-signature-256'], rawBody)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid signature.');
          return;
        }

        const payload = JSON.parse(rawBody.toString('utf8'));
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('EVENT_RECEIVED');

        handleWebhookPayload(payload).catch(error => {
          console.error('[WEBHOOK] Processing failed:', error);
        });
      } catch (error) {
        console.error('[WEBHOOK] Invalid request:', error);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request.');
      }

      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Messenger casino bot is running.');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found.');
  }).listen(port, () => {
    console.log(`[BOT] Messenger webhook listening on http://localhost:${port}${webhookPath}`);
  });
}

async function start() {
  ensureDataFiles();
  loadCommands();

  if (!process.env.MESSENGER_VERIFY_TOKEN?.trim()) {
    throw new Error('Missing MESSENGER_VERIFY_TOKEN in environment variables.');
  }

  if (!process.env.MESSENGER_PAGE_ACCESS_TOKEN?.trim()) {
    throw new Error('Missing MESSENGER_PAGE_ACCESS_TOKEN in environment variables.');
  }

  createServer();
}

start().catch(error => {
  console.error('[FATAL] Failed to start Messenger bot:', error);
  process.exit(1);
});
