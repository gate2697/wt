# Plesk + Phusion Passenger deployment

This build is designed to run as one native Plesk Node.js application managed by Phusion Passenger. It does **not** bind to a hard-coded port. Passenger supplies `process.env.PORT` when Plesk starts the app.

## Upload layout

Upload the contents of this folder into the app root, for example:

```text
/httpdocs/backend/
  server.cjs
  package.json
  .env
  src/
  public/
  scripts/
  frontend-src/
  bot/
```

## Plesk Node.js settings

Use these values:

```text
Application Root: /httpdocs/backend
Document Root: /httpdocs/backend/public
Application Startup File: server.cjs
Application Mode: production
Node.js Version: 20.x or newer
```

The Document Root must be inside the Application Root. Do not set the startup file to a file outside the application root.

## Install and build

In Plesk's Node.js screen, run **NPM install**. Then run these scripts:

```text
build:frontend
migrate
```

The zip already includes a production frontend build in `public/`, but `build:frontend` is safe to run again after edits.

Install the optional War Thunder Python resolver if your hosting plan allows Python packages:

```bash
python3 -m pip install -r requirements.txt
```

## Environment variables

Copy `.env.example` to `.env` in the Application Root, or add the same values in Plesk's custom environment variables. Do **not** set `PORT` yourself.

Required Discord Developer Portal redirect:

```text
https://golf-cb.xyz/auth/discord/callback
```

For role permissions, use either Discord role names or role IDs:

```text
CB_MOD_PERMS=cbmodperms
CB_HMOD_PERMS=cbhmodperms
CB_HIGHMOD_PERMS=highmodperms
```

Role IDs are the most reliable. Role names work when `DISCORD_BOT_TOKEN` can read guild roles.

## Start and restart

Use Plesk's **Restart App** button. Do not manually run `npm run start` from SSH unless you are testing outside Passenger with a temporary `PORT` value.

## Test URLs

```text
https://golf-cb.xyz/health
https://golf-cb.xyz/auth/discord
https://golf-cb.xyz/auth/me
```

## Bot process

The web panel and API run under Passenger. The Discord/War Thunder bot in `bot/` is a separate long-running process and should be run using a host feature that supports persistent Node.js workers. Passenger can restart or idle web processes, so it should not be the only host for a permanently connected Discord gateway bot.

## `/auth/me` returns 500

This build uses signed cookie sessions instead of `express-mysql-session`. This avoids Passenger requests failing when the hosting database user cannot create or access a `sessions` table.

After replacing the files, run **NPM install** again and then **Restart App** in Plesk. A logged-out request to `/auth/me` should return:

```json
{"user":null}
```
