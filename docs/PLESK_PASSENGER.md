# Plesk + Passenger deployment for golf-cb.xyz

This repository is one Plesk Node.js application. Do not add a custom `PORT`
environment variable in Plesk. The startup code binds an ephemeral port when
Passenger does not export `PORT`; Passenger replaces it with its managed socket.

## File layout and Plesk settings

For a Git checkout located at `/httpdocs`, use:

```text
Application Root: /httpdocs
Document Root: /httpdocs/public
Application Startup File: _passenger.cjs
Application Mode: production
Node.js Version: 20.x or newer
```

The important rule is that `_passenger.cjs`, `server.cjs`, `package.json`, `src/`, and `public/`
must all be inside the selected Application Root. The Document Root must be its
`public` child. Do not select `/httpdocs/backend`; that directory is an older,
separate implementation and does not contain the production startup file.

Use `_passenger.cjs` as the Plesk startup file. It is a CommonJS compatibility
loader for Passenger versions that cannot require an ES module directly. The
same application is also available as `server.cjs` for npm-based checks.

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

Use numeric Discord role IDs in the hierarchy variables below when possible.
Role names require a working `DISCORD_BOT_TOKEN`; numeric IDs do not.

```env
CB_TRIAL_MOD_PERMS=
CB_MOD_PERMS=
CB_HMOD_PERMS=
# Comma-separated role IDs are allowed at the top level.
CB_ADMIN_PERMS=
CB_HEAD_ADMIN_PERMS=
CB_OWNER_PERMS=
CB_MAP_CREATOR_PERMS=
```

The highest matching role wins. Trial Mods may ban for 24 hours, Mods for
3 days, and HMods/Admins/Head Admins/Owners may create permanent bans. A ban
created below Admin is stored as a pending request and stays hidden from public
lookup and bot enforcement until a strictly higher rank approves it.

The signed-in session rechecks Discord membership and roles about once per
minute when `DISCORD_BOT_TOKEN` is configured, so role changes do not require a
logout/login cycle.

Map creators publish maps from `/map-creator`. Configure their role with
`CB_MAP_CREATOR_PERMS`; HMods and higher can also manage the catalogue. The
Discord bot automatically polls `/api/map-votes/bot/state` and, when
`MAP_VOTE_AUTO_START=true`, sends the protected `/end` and `/start` signals.
Set `MAP_VOTE_ROUND_SECONDS` to the round length (default 900 seconds).

In Discord Developer Portal > OAuth2 > Redirects, register exactly:

```text
https://golf-cb.xyz/auth/discord/callback
```

There is no trailing slash.

## Install and deploy

From the Application Root (or through Plesk's npm/script runner):

```bash
npm install
npm run build:frontend
npm run migrate
npm run diagnose:auth
npm run diagnose:app
npm run diagnose:startup
```

These are npm scripts; you do not need to invoke `node` yourself. The two
diagnostics print only pass/fail status and do not print secret values.
`diagnose:startup` launches both compatibility startup files briefly with the
same no-`PORT` Passenger condition seen on this server; it does not change the
running Plesk application.
After it passes, use Plesk's **Restart App** button.

Run `npm run migrate` after this update so existing databases receive the
review/creator-rank, unban-request, in-site notification, staff-application,
ban-request, evidence-file, unban-conversation, map-catalogue, and map-vote
tables. It also adds the
Discord join-date column used for the 30-day staff rule. The migration is
additive and preserves all existing ban records. It also adds Discord delivery
status/reason columns to unban requests, staff applications, and conversation
messages. Pending unban requests are
retained when a ban expires or is revoked outside the request flow, so staff
can close the stale record manually.

Lower-rank bans are stored as ban requests until a strictly higher rank
approves them. They are not exposed to the public lookup or bot enforcement
while pending. Each request accepts up to 10 evidence files with a 100 MB
total limit; temporary upload fragments are removed after the request is
stored. The stable War Thunder ID is required by default. A War Thunder plugin
can push resolved IDs with `POST /api/bot/playerlist` or
`POST /api/bot/resolve-player` using the bot token, and the panel will reuse
those IDs when creating a ban request. If you use a separate resolver service,
set `WT_PLUGIN_RESOLVER_URL` and optionally `WT_PLUGIN_RESOLVER_TOKEN`.

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
