require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Manage Hacksaw weekend events')
    .addSubcommand((s) => s.setName('setup').setDescription('Start the event setup wizard'))
    .addSubcommand((s) => s.setName('list').setDescription('Show active and scheduled events'))
    .addSubcommand((s) => s.setName('promo-now').setDescription('Promote the next scheduled event now'))
    .addSubcommand((s) => s.setName('promo-pause').setDescription('Pause automatic event promotions'))
    .addSubcommand((s) => s.setName('promo-resume').setDescription('Resume automatic event promotions'))
    .addSubcommand((s) => s.setName('promo-status').setDescription('Show promotion status'))
    .addSubcommand((s) => s.setName('repeat-stop').setDescription('Stop weekly repeat for an event').addStringOption((o) => o.setName('event_id').setDescription('Event ID from /event list').setRequired(false)))
    .addSubcommand((s) => s.setName('cancel').setDescription('Cancel a scheduled event').addStringOption((o) => o.setName('event_id').setDescription('Event ID from /event list').setRequired(false)))
    .addSubcommand((s) => s.setName('templates-refresh').setDescription('Refresh event templates from the forum channel'))
    .addSubcommand((s) => s.setName('templates-check').setDescription('Validate cached event templates')),
].map((command) => command.toJSON());

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token || !clientId || !guildId) throw new Error('DISCORD_TOKEN, CLIENT_ID, and GUILD_ID are required.');

  const rest = new REST({ version: '10' }).setToken(token);
  console.log('Registering guild slash commands...');
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log('Slash commands registered.');
}

if (require.main === module) {
  registerCommands().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { commands, registerCommands };
