const config = require('../config/config');
const { EmbedBuilder } = require('./messenger');

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(config.embed.primary);
}

function infoEmbed(title, description) {
  return baseEmbed()
    .setTitle(title)
    .setDescription(description);
}

function successEmbed(title, description) {
  return baseEmbed()
    .setTitle(title)
    .setDescription(description);
}

function errorEmbed(title, description) {
  return baseEmbed()
    .setTitle(title)
    .setDescription(description);
}

module.exports = {
  EmbedBuilder,
  baseEmbed,
  infoEmbed,
  successEmbed,
  errorEmbed
};
