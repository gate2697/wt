# CB Ban Panel Starter

This is a starter project for a Discord-linked War Thunder moderation/ban panel.

It includes:

- Website API with Discord OAuth login
- Role/permission-gated panels: mod, hmod, highmod
- Link-code API for connecting another service/account
- Ban API that resolves War Thunder usernames to IDs through a resolver adapter
- Ban logs with active start/end times, reasons, moderator info, and audit entries
- Public ban lookup page/API for banned users
- Bot bridge API for live player list, ban checks, and kick decisions
- Discord bot starter that can sync guild member roles and expose playerlist hooks

## War Thunder ID resolver

The simple/default setup now uses Python + `wt-profile-tool` to resolve a War Thunder nickname into a stable user ID. PyPI describes `wt-profile-tool` as a community package for fetching War Thunder profiles, including getting a user ID by nickname/prefix and profile by ID. It is not an official Gaijin package.

Install it once before running the backend:

```bash
python -m pip install -r requirements.txt
```

The backend calls:

```txt
scripts/resolve_wt_user.py <username>
```

That script tries the plain nickname first. If that lookup fails or returns no ID, it automatically retries with `@live`, then `@psn`. It returns JSON with the matched nickname, War Thunder user ID, and which lookup name worked. If the resolver fails, `ALLOW_UNRESOLVED_BANS=true` lets the panel still save bans by username only. Set `ALLOW_UNRESOLVED_BANS=false` if you want ban creation to fail whenever an ID cannot be resolved.

I left the old StatShark-style URL adapter in place too. If you later get a confirmed StatShark lookup endpoint, set `STATSHARK_LOOKUP_URL` and the backend will use that instead of the Python resolver.

## Quick start

1. Install Node.js 20+.
2. Install Python 3.11+ and run `python -m pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` in `backend`, `frontend`, and `bot` where applicable.
4. Fill in Discord app/bot credentials.
5. From this folder:

```bash
npm run install:all
npm run dev:backend
npm run dev:frontend
npm run dev:bot
```

Backend defaults to `http://localhost:4000`.
Frontend defaults to `http://localhost:5173`.

## Discord setup

Create a Discord application:

- OAuth2 redirect URL: `http://localhost:4000/auth/discord/callback`
- Scopes: `identify guilds guilds.members.read`
- Bot token: put in `bot/.env`

Role/perms are checked by role names or IDs in backend env:

- `CB_MOD_PERMS`
- `CB_HMOD_PERMS`
- `CB_HIGHMOD_PERMS`

You can use comma-separated role names or role IDs.

## Basic API map

### Auth

- `GET /auth/discord` starts login
- `GET /auth/me` returns current user and permissions
- `POST /auth/logout` logs out

### Link codes

- `POST /api/link-codes` creates a one-time code
- `POST /api/link-codes/claim` claims a code for another service

### Bans

- `POST /api/bans` creates a ban, resolves player ID if needed
- `GET /api/bans/active` lists active bans
- `GET /api/bans/:id` reads one ban
- `PATCH /api/bans/:id` edits reason/end time/status
- `POST /api/bans/:id/revoke` revokes a ban
- `GET /api/public/bans/:player` public ban lookup by username or player ID

### Bot bridge

Protected by `BOT_API_TOKEN` header: `Authorization: Bearer <token>`.

- `POST /api/bot/playerlist` bot posts active players
- `GET /api/bot/playerlist` panel reads active players
- `POST /api/bot/check-ban` bot checks one player and receives kick decision
- `POST /api/bot/name-change` records username changes
- `GET /api/bot/cb-status` returns whether CB is online
- `POST /api/bot/cb-status` bot updates online status


## Ban notifications

When a ban is created, the backend now checks `player_links` for a linked War Thunder account. If it finds a linked site/Discord user, it will try to notify them in two ways:

- Discord DM using `DISCORD_BOT_TOKEN` in `backend/.env`
- Email using the SMTP settings in `backend/.env`

The Discord OAuth login now requests the `email` scope so the site can store a verified Discord account email. Email notifications only send when the linked user has an email saved and SMTP is configured. Discord DMs only send when the backend has a bot token and the user allows DMs from the bot/server. Notification attempts are saved in `notification_log` so failed DMs/emails do not break ban creation.

Required backend env for Discord DMs:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
```

Required backend env for email:

```env
NOTIFY_FROM_EMAIL="CB Ban Panel <no-reply@example.com>"
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password_or_app_password
```

### Linking a War Thunder account to a site user

1. The user logs in with Discord.
2. The site creates a link code:

```http
POST /api/link-codes
{ "serviceName": "warthunder", "minutesValid": 15 }
```

3. Your War Thunder bot or external service claims it after confirming the player owns that account:

```http
POST /api/link-codes/claim
{
  "code": "ABCD1234",
  "serviceName": "warthunder",
  "externalId": "62681955",
  "externalUsername": "gatetheproto"
}
```

After that, if `62681955` gets banned, the linked Discord/site user gets the ban reason, start time, end time, and ban length.

## Keep building from here

The frontend is intentionally simple so you can keep changing it. The backend is split into services/routes so adding features is straightforward.


## Duplicate-safe War Thunder lookups

The resolver does not blindly use the first match. For an unsuffixed name it checks the normal nickname, `@live`, and `@psn`. If those resolve to different War Thunder IDs, the API returns `duplicate_accounts_found` and asks for the exact suffixed username or a manual ID. This is intentional so a mod does not ban the wrong account when both names exist.

## Latest UI/server-lock changes

This build is locked to Discord server `1495608662025048125` by default. Set this in `backend/.env`:

```env
DISCORD_GUILD_ID=1495608662025048125
DISCORD_REQUIRE_GUILD_MEMBERSHIP=true
```

The frontend now uses tabbed panel pages for Public, Mod, HMod, High Mod, and Linking. The live player list is pinned on the right side and sized to about 10% of the page on desktop. Clicking a live player fills their name into the Mod ban form.

The ban form includes premade ban messages like `Random killing` and `Disobeying staff`. Staff can save custom reasons locally; those are stored in the browser cookie `cb_custom_ban_reasons` so each mod can keep their own shortcuts without changing the server database.

## Vercel deploy

This zip includes a Vercel-ready frontend/proxy setup:

- `vercel.json` builds `frontend/`.
- `api/[...path].js` proxies Vercel `/api/...` and `/auth/...` requests to your real backend.
- Set `BACKEND_URL` in Vercel to your hosted backend URL.
- See `docs/VERCEL.md` for the full setup.
