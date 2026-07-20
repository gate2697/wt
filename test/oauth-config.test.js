import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_BASE_URL = 'https://golf-cb.xyz/';
process.env.FRONTEND_URL = 'https://golf-cb.xyz/';
process.env.DISCORD_CLIENT_ID = '1510907031568252938';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.DISCORD_GUILD_ID = '1495608662025048125';
process.env.DISCORD_REDIRECT_URI = '';
process.env.DISCORD_OAUTH_SCOPES = '';
process.env.SESSION_SECRET = 'a'.repeat(32);
process.env.COOKIE_SECURE = '';
process.env.MYSQL_USER = 'test-user';
process.env.MYSQL_PASSWORD = 'test-password';
process.env.MYSQL_DATABASE = 'test-database';

const { config, authConfigProblems } = await import('../src/config.js');
const { discordAuthUrl } = await import('../src/discord/oauth.js');

test('production URLs are normalized and the callback is canonical', () => {
  assert.equal(config.publicBaseUrl, 'https://golf-cb.xyz');
  assert.equal(config.frontendUrl, 'https://golf-cb.xyz');
  assert.equal(config.discord.redirectUri, 'https://golf-cb.xyz/auth/discord/callback');
  assert.equal(config.cookiesSecure, true);
});

test('OAuth URL uses the required membership scope and state', () => {
  const url = new URL(discordAuthUrl('state-value'));
  assert.equal(url.origin, 'https://discord.com');
  assert.equal(url.pathname, '/oauth2/authorize');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://golf-cb.xyz/auth/discord/callback');
  assert.ok(new Set(url.searchParams.get('scope').split(' ')).has('guilds.members.read'));
});

test('OAuth configuration has no sign-in blockers', () => {
  assert.deepEqual(authConfigProblems(), []);
});
