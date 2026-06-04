# Plesk + Phusion Passenger deployment

This build is designed to run only as a Plesk Node.js application managed by Phusion Passenger.
It intentionally does not choose a fixed TCP port. Passenger supplies `process.env.PORT` and uses reverse port binding.

## Upload layout

Upload the contents of this folder directly into the application's root, for example:

```text
/httpdocs/backend/
  _passenger.cjs
  package.json
  .env
  src/
  public/
  scripts/
  frontend-src/
  bot/
```

## Plesk Node.js settings

Use:

```text
Application Root: /httpdocs/backend
Document Root: /httpdocs/backend/public
Application Startup File: _passenger.cjs
Application Mode: production
Node.js Version: 20.x
```

The Document Root must be a child of the Application Root.

## Install and build

In Plesk's Node.js screen, click **NPM install**. Then use the Plesk Run Script feature for:

```text
build:frontend
migrate
```

Install the Python resolver once if your hosting plan allows Python packages:

```bash
python3 -m pip install -r requirements.txt
```

## Environment variables

Copy `.env.example` to `.env` in the Application Root and fill it in, or add the same values in Plesk's custom environment variables. Do not set `PORT` yourself.

Discord Developer Portal OAuth redirect:

```text
https://golf-cb.xyz/auth/discord/callback
```

## Start and restart

Use Plesk's **Restart App** button. Do not run `npm run start` in the terminal; that command is not how Passenger starts the application and a manual shell will not have Passenger's `PORT` value.

## Test URLs

```text
https://golf-cb.xyz/health
https://golf-cb.xyz/auth/discord
```

## Bot process

The web panel and API run under Passenger. The Discord/War Thunder bot in `bot/` is a separate long-running process and should be run using a host feature that supports persistent Node.js workers. Passenger may restart or idle web application processes, so it should not be relied on as the only host for a permanently connected Discord gateway bot.
