const { ChannelType } = require('discord.js');
const config = require('./config');
const storage = require('./storage');
const { parseSectionedPost } = require('./parser');

async function fetchThreadMessages(thread) {
  const messages = await thread.messages.fetch({ limit: 100 });
  return [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function imageUrlFromMessage(message) {
  const attachment = message.attachments.find((a) => {
    const type = a.contentType || '';
    return type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || a.url || '');
  });

  if (attachment?.url) return attachment.url;

  const embedWithImage = message.embeds.find((embed) => {
    return embed.image?.url || embed.thumbnail?.url;
  });

  if (embedWithImage?.image?.url) return embedWithImage.image.url;
  if (embedWithImage?.thumbnail?.url) return embedWithImage.thumbnail.url;

  const imageLinkMatch = (message.content || '').match(/https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?/i);
  if (imageLinkMatch) return imageLinkMatch[0];

  return null;
}

function imageUrlFromMessages(messages) {
  for (const message of messages) {
    const imageUrl = imageUrlFromMessage(message);
    if (imageUrl) return imageUrl;
  }

  return null;
}

function combinedThreadContent(messages) {
  return messages
    .map((message) => message.content || '')
    .filter(Boolean)
    .join('\n\n');
}

async function refreshTemplates(client) {
  const forum = await client.channels.fetch(config.templateForumChannelId);

  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error('TEMPLATE_FORUM_CHANNEL_ID must point to a Discord forum channel.');
  }

  const active = await forum.threads.fetchActive();
  const archived = await forum.threads.fetchArchived({ limit: 100 });
  const threads = [...active.threads.values(), ...archived.threads.values()];
  const templates = [];

  for (const thread of threads) {
    try {
      const fullThread = await thread.fetch();
      const messages = await fetchThreadMessages(fullThread);

      const content = combinedThreadContent(messages);
      const parsed = parseSectionedPost(content);
      const imageUrl = imageUrlFromMessages(messages);

      templates.push({
        threadId: fullThread.id,
        title: fullThread.name,
        description: parsed.description,
        rules: parsed.rules,
        rewards: parsed.rewards,
        missing: parsed.missing,
        imageUrl,
        sourceUrl: `https://discord.com/channels/${config.guildId}/${fullThread.id}`,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (error) {
      templates.push({
        threadId: thread.id,
        title: thread.name || `Thread ${thread.id}`,
        description: '',
        rules: '',
        rewards: '',
        missing: ['description', 'rules', 'rewards'],
        imageUrl: null,
        sourceUrl: `https://discord.com/channels/${config.guildId}/${thread.id}`,
        error: error.message,
        lastSyncedAt: new Date().toISOString(),
      });
    }
  }

  storage.update((db) => {
    db.templates = templates.sort((a, b) => a.title.localeCompare(b.title));
  });

  return templates;
}

function validTemplates() {
  return storage.read().templates.filter((t) => !t.missing?.length && t.imageUrl);
}

module.exports = { refreshTemplates, validTemplates };