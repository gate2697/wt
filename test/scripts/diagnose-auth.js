import { authConfigProblems, config } from '../src/config.js';
import { pool } from '../src/db/database.js';

const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const expectedRedirect = `${config.publicBaseUrl || 'https://golf-cb.xyz'}/auth/discord/callback`;
const scopes = new Set(config.discord.oauthScopes.split(/\s+/).filter(Boolean));
const allConfiguredRoles = [...config.roles.mod, ...config.roles.hmod, ...config.roles.highmod];
const usingOnlyNumericRoleIds = allConfiguredRoles.length > 0 && allConfiguredRoles.every((role) => /^\d{16,22}$/.test(role));

add('PUBLIC_BASE_URL', config.publicBaseUrl === 'https://golf-cb.xyz', config.publicBaseUrl || 'missing');
add('FRONTEND_URL', config.frontendUrl === 'https://golf-cb.xyz', config.frontendUrl || 'missing');
add('secure session cookie', config.cookiesSecure, config.cookiesSecure ? 'enabled' : 'disabled');
add('SESSION_SECRET', config.sessionSecret !== 'dev-secret-change-me' && config.sessionSecret.length >= 32, 'must be at least 32 characters');
add('Discord client ID', Boolean(config.discord.clientId), config.discord.clientId ? 'configured' : 'missing');
add('Discord client secret', Boolean(config.discord.clientSecret), config.discord.clientSecret ? 'configured' : 'missing');
add('Discord redirect URI', config.discord.redirectUri === expectedRedirect, config.discord.redirectUri || 'missing');
add('Discord identify scope', scopes.has('identify'), config.discord.oauthScopes);
add('Discord member scope', scopes.has('guilds.members.read') || Boolean(config.discord.botToken), config.discord.oauthScopes);
add('Discord guild ID', Boolean(config.discord.guildId), config.discord.guildId || 'missing');
add('moderator role mapping', usingOnlyNumericRoleIds || Boolean(config.discord.botToken), usingOnlyNumericRoleIds ? 'numeric IDs' : config.discord.botToken ? 'role names can be resolved by bot' : 'use numeric role IDs or configure DISCORD_BOT_TOKEN');
add('MySQL environment', Boolean(config.mysql.user && config.mysql.password && config.mysql.database), 'MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE are required');

try {
  await pool.query('SELECT 1');
  add('MySQL connection', true, 'connected');
} catch (error) {
  add('MySQL connection', false, `${error.code || error.name}: ${error.message}`);
} finally {
  await pool.end().catch(() => {});
}

for (const problem of authConfigProblems()) {
  if (!checks.some((check) => !check.ok && check.detail.includes(problem))) {
    add(`configuration: ${problem}`, false, problem);
  }
}

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
}

const failures = checks.filter((check) => !check.ok).length;
console.log(`\n${failures ? `${failures} problem(s) found.` : 'OAuth prerequisites look ready.'}`);
process.exitCode = failures ? 1 : 0;
