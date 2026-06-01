import dotenv from 'dotenv';
dotenv.config();

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
  databasePath: process.env.DATABASE_PATH || './data/app.sqlite',
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    redirectUri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:4000/auth/discord/callback',
    guildId: process.env.DISCORD_GUILD_ID || ''
  },
  roles: {
    mod: list('CB_MOD_PERMS', 'cbmodperms'),
    hmod: list('CB_HMOD_PERMS', 'cbhmodperms'),
    highmod: list('CB_HIGHMOD_PERMS', 'highmodperms')
  },
  botApiToken: process.env.BOT_API_TOKEN || 'change-me-bot-token',
  warthunder: {
    pythonBin: process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
    resolverScript: process.env.WT_RESOLVER_SCRIPT || '',
    resolverTimeoutMs: Number(process.env.WT_RESOLVER_TIMEOUT_MS || 15000),
    allowUnresolvedBans: process.env.ALLOW_UNRESOLVED_BANS !== 'false'
  },
  statshark: {
    lookupUrl: process.env.STATSHARK_LOOKUP_URL || '',
    token: process.env.STATSHARK_API_TOKEN || ''
  }
};
