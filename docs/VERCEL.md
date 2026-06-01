# Deploying the CB Ban Panel frontend to Vercel

This build is set up for the easiest reliable Vercel setup:

- Vercel hosts the React website.
- Vercel proxies `/api/...` and `/auth/...` requests to your real backend.
- The backend still runs on an always-on host because it stores bans, sessions, player lists, and talks to Discord/email.
- The Discord/War Thunder bot also stays on an always-on host. Vercel serverless functions do not stay running 24/7.

Vercel Functions are request/response functions under `/api`, not long-running background processes. Vercel Cron can call scheduled endpoints, but it is not a replacement for a live Discord bot or War Thunder bot process.

## 1. Host the backend somewhere always-on

Use something like Railway, Render, PebbleHost Node, a VPS, or your own PC for testing.

Backend env example:

```env
PORT=4000
PUBLIC_BASE_URL=https://YOUR-BACKEND-DOMAIN.com
FRONTEND_URL=https://YOUR-VERCEL-SITE.vercel.app
SESSION_SECRET=make_this_long_and_random
DATABASE_PATH=./data/app.sqlite

DISCORD_CLIENT_ID=1510907031568252938
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=1495608662025048125
DISCORD_REQUIRE_GUILD_MEMBERSHIP=true

# IMPORTANT: this must be your Vercel URL, because users click login from Vercel.
DISCORD_REDIRECT_URI=https://YOUR-VERCEL-SITE.vercel.app/auth/discord/callback

BOT_API_TOKEN=make_this_long_and_random

NOTIFY_FROM_EMAIL="CB Ban Panel <no-reply@example.com>"
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

Start the backend:

```bash
cd backend
npm install
npm run start
```

## 2. Add the Discord redirect

In Discord Developer Portal > OAuth2 > Redirects, add exactly:

```txt
https://YOUR-VERCEL-SITE.vercel.app/auth/discord/callback
```

For local-only testing, you can still use:

```txt
http://localhost:4000/auth/discord/callback
```

## 3. Deploy this repo to Vercel

Set this Vercel environment variable:

```env
BACKEND_URL=https://YOUR-BACKEND-DOMAIN.com
```

Do not include a trailing slash.

Leave `VITE_API_BASE` unset/blank in Vercel. The frontend will use same-domain requests like `/api/bans`, and `api/[...path].js` will proxy them to your backend.

## 4. Bot settings

The bot should usually talk directly to the backend, not to Vercel:

```env
SITE_API_URL=https://YOUR-BACKEND-DOMAIN.com
BOT_API_TOKEN=same_token_as_backend
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=1495608662025048125
```

## 5. What URLs should look like

User login button on Vercel:

```txt
https://YOUR-VERCEL-SITE.vercel.app/auth/discord
```

Discord callback:

```txt
https://YOUR-VERCEL-SITE.vercel.app/auth/discord/callback
```

Frontend API request:

```txt
https://YOUR-VERCEL-SITE.vercel.app/api/bans/active
```

Actual backend behind the proxy:

```txt
https://YOUR-BACKEND-DOMAIN.com/api/bans/active
```

## Why the whole backend is not moved fully into Vercel yet

The current backend uses SQLite and a live server process. Vercel can run API functions, but the function filesystem is not a good permanent database. To make the backend 100% serverless, switch the database layer to Postgres, Turso/libSQL, Supabase, Neon, or Upstash Redis.

This proxy setup is the fastest path to make the Vercel site work correctly without losing bans/playerlist data.
