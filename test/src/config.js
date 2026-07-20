import './env.js';

function list(name, fallback = '') {
  return (process.env[name] || fallback)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function url(name, fallback = '') {
  return String(process.env[name] || fallback).trim().replace(/\/+$/, '');
}

function boolean(name, fallback = false) {
  const value = process.env[name];
  return value == null || value === '' ? fallback : value === 'true';
}

const publicBaseUrl = url('PUBLIC_BASE_URL', process.env.FRONTEND_URL || '');
const frontendUrl = url('FRONTEND_URL', publicBaseUrl);

export const config = {
  publicBaseUrl,
  frontendUrl,
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  cookiesSecure: boolean('COOKIE_SECURE', publicBaseUrl.startsWith('https://')),
  mysql: {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER || '',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || '',
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10)
  },
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    redirectUri: url('DISCORD_REDIRECT_URI', publicBaseUrl ? `${publicBaseUrl}/auth/discord/callback` : ''),
    oauthScopes: process.env.DISCORD_OAUTH_SCOPES || 'identify email guilds.members.read',
    // Locked to your CB Discord server by default.
    guildId: process.env.DISCORD_GUILD_ID || '1495608662025048125',
    requireGuildMembership: boolean('DISCORD_REQUIRE_GUILD_MEMBERSHIP', true),
    botToken: process.env.DISCORD_BOT_TOKEN || ''
  },
  roles: {
    mod: list('CB_MOD_PERMS', 'cbmodperms'),
    hmod: list('CB_HMOD_PERMS', 'cbhmodperms'),
    highmod: list('CB_HIGHMOD_PERMS', 'highmodperms')
  },
  botApiToken: process.env.BOT_API_TOKEN || process.env.BOT_API_KEY || 'change-me-bot-token',
  warthunder: {
    pythonBin: process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
    resolverScript: process.env.WT_RESOLVER_SCRIPT || '',
    resolverTimeoutMs: Number(process.env.WT_RESOLVER_TIMEOUT_MS || 15000),
    allowUnresolvedBans: process.env.ALLOW_UNRESOLVED_BANS !== 'false'
  },
  statshark: {
    lookupUrl: process.env.STATSHARK_LOOKUP_URL || '',
    token: process.env.STATSHARK_API_TOKEN || ''
  },
  notifications: {
    fromEmail: process.env.NOTIFY_FROM_EMAIL || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  }
};

export function validateProductionConfig() {
  const missing = [];
  if (!config.mysql.user) missing.push('MYSQL_USER');
  if (!config.mysql.password) missing.push('MYSQL_PASSWORD');
  if (!config.mysql.database) missing.push('MYSQL_DATABASE');
  if (!config.sessionSecret || config.sessionSecret === 'dev-secret-change-me') missing.push('SESSION_SECRET');
  if (!config.discord.clientId) missing.push('DISCORD_CLIENT_ID');
  if (!config.discord.clientSecret) missing.push('DISCORD_CLIENT_SECRET');
  if (!config.discord.redirectUri || config.discord.redirectUri.startsWith('/')) missing.push('PUBLIC_BASE_URL or DISCORD_REDIRECT_URI');
  if (!config.frontendUrl) missing.push('FRONTEND_URL or PUBLIC_BASE_URL');
  if (missing.length) throw new Error(`Missing required Plesk environment variables: ${missing.join(', ')}`);
}

export function authConfigProblems() {
  const problems = [];
  const scopes = new Set(config.discord.oauthScopes.split(/\s+/).filter(Boolean));

  if (!config.publicBaseUrl) problems.push('PUBLIC_BASE_URL');
  if (!config.frontendUrl) problems.push('FRONTEND_URL');
  if (!config.mysql.user) problems.push('MYSQL_USER');
  if (!config.mysql.password) problems.push('MYSQL_PASSWORD');
  if (!config.mysql.database) problems.push('MYSQL_DATABASE');
  if (!config.discord.clientId) problems.push('DISCORD_CLIENT_ID');
  if (!config.discord.clientSecret) problems.push('DISCORD_CLIENT_SECRET');
  if (!config.discord.redirectUri) problems.push('DISCORD_REDIRECT_URI');
  if (!scopes.has('identify')) problems.push('DISCORD_OAUTH_SCOPES must include identify');
  if (config.discord.guildId && !scopes.has('guilds.members.read') && !config.discord.botToken) {
    problems.push('DISCORD_OAUTH_SCOPES must include guilds.members.read when DISCORD_BOT_TOKEN is unset');
  }

  if (config.discord.redirectUri) {
    try {
      const redirect = new URL(config.discord.redirectUri);
      if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost') {
        problems.push('DISCORD_REDIRECT_URI must use HTTPS');
      }
    } catch {
      problems.push('DISCORD_REDIRECT_URI must be an absolute URL');
    }
  }

  if (process.env.NODE_ENV === 'production') {
    if (config.sessionSecret === 'dev-secret-change-me' || config.sessionSecret.length < 32) {
      problems.push('SESSION_SECRET must contain at least 32 characters');
    }
    if (config.publicBaseUrl.startsWith('https://') && !config.cookiesSecure) {
      problems.push('COOKIE_SECURE must be true for HTTPS');
    }
  }

  return [...new Set(problems)];
}
