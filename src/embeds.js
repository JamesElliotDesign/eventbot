const { EmbedBuilder } = require('discord.js');

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', '') + ' UK time';
}

function discordTimestamp(iso, style = 'F') {
  const unixSeconds = Math.floor(new Date(iso).getTime() / 1000);
  return `<t:${unixSeconds}:${style}>`;
}

function eventEmbed(event, options = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`🔥 Hacksaw Event: ${event.title}`)
    .setDescription(
      `**Event Time:** ${discordTimestamp(event.eventDateTimeUtc, 'F')}\n` +
      `**UK Time:** ${formatDate(event.eventDateTimeUtc)}\n` +
      `**Starts:** ${discordTimestamp(event.eventDateTimeUtc, 'R')}\n` +
      `**Event Host:** <@${event.hostUserId}>`
    )
    .addFields(
      { name: 'Description', value: event.description || 'No description provided.' },
      { name: 'Rules', value: event.rules || 'No rules provided.' },
      { name: 'Rewards', value: event.rewards || 'No rewards provided.' },
    )
    .setFooter({ text: event.repeatWeekly ? 'Repeats weekly' : 'One-time event' })
    .setTimestamp(new Date(event.eventDateTimeUtc));

  if (event.imageUrl) embed.setImage(event.imageUrl);
  if (options.preview) embed.setColor(0xf5b942);
  return embed;
}

function promoEmbed(event) {
  const shortDescription = (event.description || '').slice(0, 500);
  const embed = new EmbedBuilder()
    .setTitle(`🔥 This Weekend on Hacksaw: ${event.title}`)
    .setDescription(
      `**Event Time:** ${discordTimestamp(event.eventDateTimeUtc, 'F')}\n` +
      `**UK Time:** ${formatDate(event.eventDateTimeUtc)}\n` +
      `**Starts:** ${discordTimestamp(event.eventDateTimeUtc, 'R')}\n` +
      `**Host:** <@${event.hostUserId}>\n\n` +
      `${shortDescription}`
    )
    .addFields({
      name: 'Event details',
      value: event.templateThreadId
        ? `Full description, rules, and rewards here: https://discord.com/channels/1217816664268083220/${event.templateThreadId}`
        : 'Full description, rules, and rewards are in the event announcement.'
    })
    .setTimestamp(new Date());

  if (event.imageUrl) embed.setImage(event.imageUrl);
  return embed;
}

function statusEmbed(db) {
  const active = db.events.filter((e) => ['scheduled', 'active'].includes(e.status));
  const lines = active.length
    ? active.map((e, i) => `${i + 1}. **${e.title}** — ${discordTimestamp(e.eventDateTimeUtc, 'F')} — Host: <@${e.hostUserId}> — Promos: ${e.promoPaused ? 'paused' : 'active'} — Repeat: ${e.repeatWeekly ? 'yes' : 'no'}`).join('\n')
    : 'No active or scheduled events.';

  return new EmbedBuilder()
    .setTitle('Hacksaw Events Dashboard')
    .setDescription(lines)
    .addFields({ name: 'Global promotions', value: db.settings.promoPaused ? 'Paused' : 'Active' })
    .setTimestamp(new Date());
}

module.exports = { eventEmbed, promoEmbed, statusEmbed, formatDate, discordTimestamp };