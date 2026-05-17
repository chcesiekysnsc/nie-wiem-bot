const { EmbedBuilder } = require('discord.js');
const config = require('../config/config');

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(config.embed.primary);
}

function infoEmbed(title, description) {
  return baseEmbed()
    .setTitle(`🎰 ${title}`)
    .setDescription(description);
}

function successEmbed(title, description) {
  return baseEmbed()
    .setTitle(`✨ ${title}`)
    .setDescription(description);
}

function errorEmbed(title, description) {
  return baseEmbed()
    .setTitle(`⚠️ ${title}`)
    .setDescription(description);
}

module.exports = {
  baseEmbed,
  infoEmbed,
  successEmbed,
  errorEmbed
};
