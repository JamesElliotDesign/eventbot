const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionsBitField,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const config = require('./config');
const storage = require('./storage');
const { refreshTemplates, validTemplates } = require('./templates');
const { eventEmbed, statusEmbed, formatDate } = require('./embeds');
const { startScheduler, promoteEvent } = require('./scheduler');

const sessions = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message],
});

function isAdmin(interaction) {
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  const roles = interaction.member?.roles?.cache;
  if (!roles) return false;
  return config.adminRoleIds.some((roleId) => roles.has(roleId));
}

async function logAdmin(message) {
  if (!config.adminLogChannelId) return;
  try {
    const channel = await client.channels.fetch(config.adminLogChannelId);
    await channel.send(message);
  } catch (error) {
    console.warn('Admin log failed:', error.message);
  }
}

function nextWeekdayDate(targetDay, addWeek = false) {
  const now = new Date();
  const result = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  let delta = targetDay - result.getUTCDay();
  if (delta <= 0) delta += 7;
  if (addWeek) delta += 7;
  result.setUTCDate(result.getUTCDate() + delta);
  return result;
}

function combineDateAndTime(date, time) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0)).toISOString();
}

function eventOptions() {
  const templates = validTemplates().slice(0, 25);
  return templates.map((t) => ({ label: t.title.slice(0, 100), value: t.threadId }));
}

async function handleSetup(interaction) {
  let didDefer = false;
  let templates = validTemplates();
  if (!templates.length) {
    await interaction.deferReply({ ephemeral: true });
    didDefer = true;
    await refreshTemplates(client);
    templates = validTemplates();
    if (!templates.length) {
      await interaction.editReply('No valid event templates found. Run `/event templates-check` to see what is missing.');
      return;
    }
  }

  const sessionId = `${interaction.user.id}_${Date.now()}`;
  sessions.set(sessionId, { userId: interaction.user.id });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`setup_select_${sessionId}`)
      .setPlaceholder('Choose a predefined event')
      .addOptions(eventOptions())
  );

  const payload = { content: 'Choose the event template from the forum posts:', components: [row], ephemeral: true };
  if (didDefer) await interaction.editReply(payload);
  else await interaction.reply(payload);
}

function dateButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`date_sat_${sessionId}`).setLabel('This Saturday').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`date_sun_${sessionId}`).setLabel('This Sunday').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`date_nextsat_${sessionId}`).setLabel('Next Saturday').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`date_custom_${sessionId}`).setLabel('Custom Date').setStyle(ButtonStyle.Secondary),
  );
}

function timeButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`time_1800_${sessionId}`).setLabel('18:00 GMT').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`time_2100_${sessionId}`).setLabel('21:00 GMT').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`time_0000_${sessionId}`).setLabel('00:00 GMT').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`time_custom_${sessionId}`).setLabel('Custom Time').setStyle(ButtonStyle.Secondary),
  );
}

function repeatButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`repeat_no_${sessionId}`).setLabel('One-time Event').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`repeat_yes_${sessionId}`).setLabel('Repeat Weekly').setStyle(ButtonStyle.Success),
  );
}

function confirmButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm_yes_${sessionId}`).setLabel('Confirm Event').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`confirm_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger),
  );
}

async function showPreview(interaction, sessionId) {
  const session = sessions.get(sessionId);
  const event = {
    id: 'preview',
    title: session.template.title,
    description: session.template.description,
    rules: session.template.rules,
    rewards: session.template.rewards,
    imageUrl: session.template.imageUrl,
    hostUserId: interaction.user.id,
    eventDateTimeUtc: session.eventDateTimeUtc,
    repeatWeekly: session.repeatWeekly,
  };

  await interaction.update({
    content: 'Preview your event. Confirm when ready:',
    embeds: [eventEmbed(event, { preview: true })],
    components: [confirmButtons(sessionId)],
  });
}

function getSession(interaction, sessionId) {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== interaction.user.id) return null;
  return session;
}

async function handleCommand(interaction) {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: 'You do not have permission to manage events.', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'setup') return handleSetup(interaction);

  if (sub === 'templates-refresh') {
    await interaction.deferReply({ ephemeral: true });
    const templates = await refreshTemplates(client);
    await interaction.editReply(`Refreshed ${templates.length} event templates from the forum channel.`);
    await logAdmin(`🔄 Templates refreshed by <@${interaction.user.id}>. Count: ${templates.length}`);
    return;
  }

  if (sub === 'templates-check') {
    const db = storage.read();
    const lines = db.templates.length ? db.templates.map((t) => {
      const problems = [...(t.missing || [])];
      if (!t.imageUrl) problems.push('image');
      if (t.error) problems.push(t.error);
      return problems.length ? `⚠️ **${t.title}** — missing/problem: ${problems.join(', ')}` : `✅ **${t.title}**`;
    }) : ['No cached templates. Run `/event templates-refresh`.'];
    await interaction.reply({ content: lines.slice(0, 40).join('\n'), ephemeral: true });
    return;
  }

  if (sub === 'list' || sub === 'promo-status') {
    const db = storage.read();
    const extra = sub === 'list' ? '\n\nUse the event IDs below for cancel/repeat-stop:\n' + db.events.filter((e) => ['scheduled', 'active'].includes(e.status)).map((e) => `\`${e.id}\` — ${e.title}`).join('\n') : '';
    await interaction.reply({ embeds: [statusEmbed(db)], content: extra || undefined, ephemeral: true });
    return;
  }

  if (sub === 'promo-pause') {
    storage.update((db) => { db.settings.promoPaused = true; });
    await interaction.reply({ content: 'Automatic promotions are now paused.', ephemeral: true });
    await logAdmin(`⏸️ Promotions paused by <@${interaction.user.id}>.`);
    return;
  }

  if (sub === 'promo-resume') {
    storage.update((db) => { db.settings.promoPaused = false; });
    await interaction.reply({ content: 'Automatic promotions are now resumed.', ephemeral: true });
    await logAdmin(`▶️ Promotions resumed by <@${interaction.user.id}>.`);
    return;
  }

  if (sub === 'promo-now') {
    const db = storage.read();
    const event = db.events.filter((e) => e.status === 'scheduled').sort((a, b) => new Date(a.eventDateTimeUtc) - new Date(b.eventDateTimeUtc))[0];
    if (!event) return interaction.reply({ content: 'No scheduled event found to promote.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    await promoteEvent(client, event, 'manual');
    await interaction.editReply(`Promoted **${event.title}** in the promo channel.`);
    await logAdmin(`📣 Manual promo posted by <@${interaction.user.id}> for **${event.title}**.`);
    return;
  }

  if (sub === 'repeat-stop' || sub === 'cancel') {
    const suppliedId = interaction.options.getString('event_id');
    const db = storage.read();
    const scheduled = db.events.filter((e) => e.status === 'scheduled');
    const target = suppliedId ? scheduled.find((e) => e.id === suppliedId) : scheduled[0];
    if (!target) return interaction.reply({ content: 'No matching scheduled event found.', ephemeral: true });

    storage.update((state) => {
      const event = state.events.find((e) => e.id === target.id);
      if (sub === 'repeat-stop') event.repeatWeekly = false;
      if (sub === 'cancel') event.status = 'cancelled';
      event.updatedAt = new Date().toISOString();
    });

    const action = sub === 'repeat-stop' ? 'Weekly repeat stopped' : 'Event cancelled';
    await interaction.reply({ content: `${action} for **${target.title}**.`, ephemeral: true });
    await logAdmin(`🛠️ ${action} by <@${interaction.user.id}> for **${target.title}**.`);
    return;
  }
}

async function handleSelect(interaction) {
  const sessionId = interaction.customId.replace('setup_select_', '');
  const session = getSession(interaction, sessionId);
  if (!session) return interaction.reply({ content: 'This setup session has expired or belongs to another admin.', ephemeral: true });

  const threadId = interaction.values[0];
  const template = storage.read().templates.find((t) => t.threadId === threadId);
  session.template = template;
  sessions.set(sessionId, session);

  await interaction.update({ content: `Selected **${template.title}**. Choose the event date:`, components: [dateButtons(sessionId)], embeds: [] });
}

async function handleButton(interaction) {
  const parts = interaction.customId.split('_');
  const type = parts[0];
  const value = parts[1];
  const sessionId = parts.slice(2).join('_');
  const session = getSession(interaction, sessionId);
  if (!session) return interaction.reply({ content: 'This setup session has expired or belongs to another admin.', ephemeral: true });

  if (type === 'date') {
    if (value === 'custom') {
      const modal = new ModalBuilder().setCustomId(`modal_date_${sessionId}`).setTitle('Custom event date');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date in YYYY-MM-DD, GMT/UTC').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('2026-05-09')));
      await interaction.showModal(modal);
      return;
    }
    session.date = value === 'sun' ? nextWeekdayDate(0) : nextWeekdayDate(6, value === 'nextsat');
    sessions.set(sessionId, session);
    await interaction.update({ content: 'Choose the event start time:', components: [timeButtons(sessionId)] });
    return;
  }

  if (type === 'time') {
    if (value === 'custom') {
      const modal = new ModalBuilder().setCustomId(`modal_time_${sessionId}`).setTitle('Custom event time');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time').setLabel('Time in HH:mm, GMT/UTC').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('20:30')));
      await interaction.showModal(modal);
      return;
    }
    const time = value === '1800' ? '18:00' : value === '2100' ? '21:00' : '00:00';
    session.time = time;
    session.eventDateTimeUtc = combineDateAndTime(session.date, session.time);
    sessions.set(sessionId, session);
    await interaction.update({ content: `Event time set to **${formatDate(session.eventDateTimeUtc)}**. Should this repeat weekly?`, components: [repeatButtons(sessionId)] });
    return;
  }

  if (type === 'repeat') {
    session.repeatWeekly = value === 'yes';
    sessions.set(sessionId, session);
    return showPreview(interaction, sessionId);
  }

  if (type === 'confirm') {
    if (value === 'cancel') {
      sessions.delete(sessionId);
      await interaction.update({ content: 'Event setup cancelled.', embeds: [], components: [] });
      return;
    }

    const event = {
      id: storage.makeId('evt'),
      templateThreadId: session.template.threadId,
      title: session.template.title,
      description: session.template.description,
      rules: session.template.rules,
      rewards: session.template.rewards,
      imageUrl: session.template.imageUrl,
      hostUserId: interaction.user.id,
      createdByUserId: interaction.user.id,
      eventDateTimeUtc: session.eventDateTimeUtc,
      repeatWeekly: !!session.repeatWeekly,
      promoPaused: false,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storage.update((db) => { db.events.push(event); });
    sessions.delete(sessionId);
    await interaction.update({ content: `Event scheduled. Event ID: \`${event.id}\``, embeds: [eventEmbed(event)], components: [] });
    await logAdmin(`✅ Event created by <@${interaction.user.id}>: **${event.title}** — ${formatDate(event.eventDateTimeUtc)} — repeat: ${event.repeatWeekly ? 'yes' : 'no'}`);
  }
}

async function handleModal(interaction) {
  const parts = interaction.customId.split('_');
  const modalType = parts[1];
  const sessionId = parts.slice(2).join('_');
  const session = getSession(interaction, sessionId);
  if (!session) return interaction.reply({ content: 'This setup session has expired or belongs to another admin.', ephemeral: true });

  if (modalType === 'date') {
    const value = interaction.fields.getTextInputValue('date');
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return interaction.reply({ content: 'Invalid date. Use YYYY-MM-DD.', ephemeral: true });
    session.date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0));
    sessions.set(sessionId, session);
    await interaction.reply({ content: 'Date saved. Choose the event start time:', components: [timeButtons(sessionId)], ephemeral: true });
    return;
  }

  if (modalType === 'time') {
    const value = interaction.fields.getTextInputValue('time');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return interaction.reply({ content: 'Invalid time. Use HH:mm in 24-hour GMT/UTC format.', ephemeral: true });
    session.time = value;
    session.eventDateTimeUtc = combineDateAndTime(session.date, session.time);
    sessions.set(sessionId, session);
    await interaction.reply({ content: `Event time set to **${formatDate(session.eventDateTimeUtc)}**. Should this repeat weekly?`, components: [repeatButtons(sessionId)], ephemeral: true });
  }
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  startScheduler(client);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'event') return handleCommand(interaction);
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('setup_select_')) return handleSelect(interaction);
    if (interaction.isButton()) return handleButton(interaction);
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_')) return handleModal(interaction);
  } catch (error) {
    console.error(error);
    const content = `Something went wrong: ${error.message}`;
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content, ephemeral: true });
    else await interaction.reply({ content, ephemeral: true });
  }
});

client.login(config.token);
