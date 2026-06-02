import './env.js';

function list(name, fallback = '') {
  return (process.env[name] || fallback)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 4000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  cookiesSecure: process.env.COOKIE_SECURE === 'true',
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
    redirectUri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:4000/auth/discord/callback',
    // Locked to your CB Discord server by default.
    guildId: process.env.DISCORD_GUILD_ID || '1495608662025048125',
    requireGuildMembership: process.env.DISCORD_REQUIRE_GUILD_MEMBERSHIP !== 'false',
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
