const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = require('./config/config');
const { ensureDataFiles } = require('./utils/storage');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

client.commands = new Collection();
client.marriageRequests = new Collection();
client.config = config;

function loadFiles(folder, target) {
  const folderPath = path.join(__dirname, folder);
  const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    delete require.cache[require.resolve(filePath)];
    const item = require(filePath);

    if (target === 'commands') {
      if (!item.name || typeof item.execute !== 'function') {
        console.warn(`[WARN] Invalid command file: ${file}`);
        continue;
      }

      client.commands.set(item.name, item);
      for (const alias of item.aliases || []) {
        client.commands.set(alias, item);
      }
      continue;
    }

    if (typeof item === 'function') {
      item(client);
    }
  }
}

async function start() {
  ensureDataFiles();
  loadFiles('commands', 'commands');
  loadFiles('events', 'events');

  const token = process.env.DISCORD_TOKEN?.trim();

  if (!token) {
    throw new Error('Missing DISCORD_TOKEN in environment variables.');
  }

  await client.login(token);
}

start().catch(error => {
  if (error?.code === 'TokenInvalid') {
    console.error('[FATAL] Invalid Discord token. Check .env and make sure DISCORD_TOKEN is the bot token from Discord Developer Portal > Bot > Reset Token.');
    process.exit(1);
  }

  console.error('[FATAL] Failed to start bot:', error);
  process.exit(1);
});
