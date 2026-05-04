const { ChannelType } = require('discord.js');
const config = require('./config');
const storage = require('./storage');
const { parseSectionedPost } = require('./parser');

async function fetchStarterMessage(thread) {
  if (typeof thread.fetchStarterMessage === 'function') {
    return thread.fetchStarterMessage();
  }
  const messages = await thread.messages.fetch({ limit: 1, after: '0' });
  return messages.first();
}

function attachmentImageUrl(message) {
  const attachment = message.attachments.find((a) => {
    const type = a.contentType || '';
    return type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || a.url || '');
  });
  return attachment?.url || null;
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
      const starter = await fetchStarterMessage(fullThread);
      if (!starter) continue;
      const parsed = parseSectionedPost(starter.content || '');
      templates.push({
        threadId: fullThread.id,
        title: fullThread.name,
        description: parsed.description,
        rules: parsed.rules,
        rewards: parsed.rewards,
        missing: parsed.missing,
        imageUrl: attachmentImageUrl(starter),
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
