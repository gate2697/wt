import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const BACKEND_URL = process.env.BACKEND_URL || process.env.SITE_API_URL || 'http://localhost:4000';
const BOT_API_TOKEN = process.env.BOT_API_TOKEN || process.env.BOT_API_KEY || 'change-me-bot-token';

async function backend(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${BOT_API_TOKEN}` },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Backend error ${res.status}`);
  return json;
}

const commands = [
  new SlashCommandBuilder().setName('cbstatus').setDescription('Set CB online/offline')
    .addBooleanOption(o => o.setName('online').setDescription('Is CB online?').setRequired(true))
    .addStringOption(o => o.setName('hint').setDescription('Invite/help text').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('checkban').setDescription('Check if a player is banned')
    .addStringOption(o => o.setName('username').setDescription('War Thunder username').setRequired(true))
    .addStringOption(o => o.setName('id').setDescription('War Thunder player ID, if known').setRequired(false))
].map(c => c.toJSON());

async function registerCommands(clientId) {
  const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
  if (!process.env.DISCORD_BOT_TOKEN || !guildId) return;
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log('Slash commands registered.');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands(client.user.id).catch(console.error);
  await backend('/api/bot/cb-status', { method: 'POST', body: { online: true, name: 'CB Bot', inviteHint: 'Ask a mod/hmod for an invite if you cannot see CB.' } }).catch(console.error);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'cbstatus') {
      const online = interaction.options.getBoolean('online', true);
      const hint = interaction.options.getString('hint') || undefined;
      await backend('/api/bot/cb-status', { method: 'POST', body: { online, inviteHint: hint } });
      await interaction.reply({ content: `CB status updated to ${online ? 'online' : 'offline'}.`, ephemeral: true });
    }
    if (interaction.commandName === 'checkban') {
      const username = interaction.options.getString('username', true);
      const warthunderId = interaction.options.getString('id') || undefined;
      const out = await backend('/api/bot/check-ban', { method: 'POST', body: { username, warthunderId } });
      await interaction.reply({ content: out.banned ? `${username} is banned. Reason: ${out.ban.reason}` : `${username} is not banned.`, ephemeral: true });
    }
  } catch (err) {
    await interaction.reply({ content: `Error: ${err.message}`, ephemeral: true }).catch(()=>{});
  }
});

// Hook this to your War Thunder bot/playerlist source.
// Example payload:
// await backend('/api/bot/playerlist', { method: 'POST', body: { source: 'warthunder-bot', players: [{ username: 'Player', warthunderId: '123' }] } });
// For each player joined/seen:
// const decision = await backend('/api/bot/check-ban', { method: 'POST', body: { username, warthunderId } });
// if (decision.action === 'kick') kick them in-game using your bot integration.

process.on('SIGINT', async () => {
  await backend('/api/bot/cb-status', { method: 'POST', body: { online: false } }).catch(()=>{});
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
