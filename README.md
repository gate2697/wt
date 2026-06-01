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

That script returns JSON with the matched nickname and War Thunder user ID. If the resolver fails, `ALLOW_UNRESOLVED_BANS=true` lets the panel still save bans by username only. Set `ALLOW_UNRESOLVED_BANS=false` if you want ban creation to fail whenever an ID cannot be resolved.

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

## Keep building from here

The frontend is intentionally simple so you can keep changing it. The backend is split into services/routes so adding features is straightforward.
