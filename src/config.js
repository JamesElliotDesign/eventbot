const path = require('node:path');
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || value.includes('PASTE_')) {
    throw new Error(`Missing required .env value: ${name}`);
  }
  return value;
}

function optional(name, fallback = '') {
  return process.env[name] || fallback;
}

function list(name) {
  return optional(name)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const dataFile = optional('DATA_FILE', './data/hacksaw-events.json');

module.exports = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: required('GUILD_ID'),
  templateForumChannelId: required('TEMPLATE_FORUM_CHANNEL_ID'),
  promoChannelId: required('PROMO_CHANNEL_ID'),
  adminLogChannelId: optional('ADMIN_LOG_CHANNEL_ID'),
  adminRoleIds: list('ADMIN_ROLE_IDS'),
  defaultTimezone: optional('DEFAULT_TIMEZONE', 'UTC'),
  dataFile: path.resolve(process.cwd(), dataFile),
};
