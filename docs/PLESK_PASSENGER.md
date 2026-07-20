# Plesk + Passenger deployment for golf-cb.xyz

This repository is one Plesk Node.js application. Passenger supplies `PORT`;
never add a custom `PORT` environment variable in Plesk.

## File layout and Plesk settings

For a Git checkout located at `/httpdocs`, use:

```text
Application Root: /httpdocs
Document Root: /httpdocs/public
Application Startup File: server.cjs
Application Mode: production
Node.js Version: 20.x or newer
```

The important rule is that `server.cjs`, `package.json`, `src/`, and `public/`
must all be inside the selected Application Root. The Document Root must be its
`public` child. Do not select `/httpdocs/backend`; that directory is an older,
separate implementation and does not contain the production startup file.

## Environment

Copy `.env.example` to `.env` in the Application Root, or add the same names in
Plesk's Custom environment variables. Plesk values take priority over `.env`.

Values that must be supplied privately:

```text
SESSION_SECRET
MYSQL_USER
MYSQL_PASSWORD
MYSQL_DATABASE
DISCORD_CLIENT_SECRET
BOT_API_TOKEN
```

Keep these exact public values:

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://golf-cb.xyz
FRONTEND_URL=https://golf-cb.xyz
COOKIE_SECURE=true
DISCORD_CLIENT_ID=1510907031568252938
DISCORD_REDIRECT_URI=https://golf-cb.xyz/auth/discord/callback
DISCORD_OAUTH_SCOPES=identify email guilds.members.read
DISCORD_GUILD_ID=1495608662025048125
DISCORD_REQUIRE_GUILD_MEMBERSHIP=true
```

Use numeric Discord role IDs in `CB_MOD_PERMS`, `CB_HMOD_PERMS`, and
`CB_HIGHMOD_PERMS`. Role names require a working `DISCORD_BOT_TOKEN`; numeric IDs
do not.

In Discord Developer Portal > OAuth2 > Redirects, register exactly:

```text
https://golf-cb.xyz/auth/discord/callback
```

There is no trailing slash.

## Install and deploy

From the Application Root (or through Plesk's script runner):

```text
NPM install
build:frontend
migrate
diagnose:auth
```

`diagnose:auth` prints only pass/fail status; it does not print secret values.
After it passes, use Plesk's **Restart App** button.

## Verify in order

1. `https://golf-cb.xyz/health` returns JSON with
   `authConfigurationProblems: []` and `databaseConfigured: true`.
2. `https://golf-cb.xyz/auth/me` returns `{"user":null}` while logged out.
3. `https://golf-cb.xyz/auth/discord` redirects to `discord.com/oauth2/authorize`.
4. Complete one login. The callback should return to `https://golf-cb.xyz`.

If step 3 fails with 503, the response names the missing configuration. If the
callback returns `auth_database_unavailable`, rerun `migrate` and check the
MySQL credentials/permissions. A Discord 400 error normally means the client
secret or redirect URI does not match the Discord application.

## Secret rotation

An environment file was previously committed to this public repository. Removing
it from the current branch does not remove it from Git history. Rotate the Discord
client secret, session secret, and bot API token before deploying this revision.
