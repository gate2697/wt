# Deploy Notes

After deploying the current source, run `npm run migrate` once. The migration
is additive and creates staff applications, community ban requests, unban
conversation messages, map catalogue/vote tables, and the Discord join-date
column used for the 30-day staff rule. No new secret environment values are
required.

For production:

- Set `SESSION_SECRET` to a long random value.
- Use HTTPS; the canonical Plesk app configures secure cookies in `src/app.js`.
- Run the root Passenger app from `server.cjs` (do not point Plesk at the legacy `backend/` folder).
- Use a real database if this grows beyond a small group. SQLite is fine for testing and small moderation teams.
- Keep `BOT_API_TOKEN` private. Rotate it if it leaks.
- Only enable the StatShark adapter after you have permission and a stable endpoint.

## Environment checklist

Backend:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_GUILD_ID`
- `CB_TRIAL_MOD_PERMS`
- `CB_MOD_PERMS`
- `CB_HMOD_PERMS`
- `CB_ADMIN_PERMS`
- `CB_HEAD_ADMIN_PERMS`
- `CB_OWNER_PERMS`
- `CB_MAP_CREATOR_PERMS` (the Discord role ID/name allowed to publish maps)
- `DISCORD_BOT_TOKEN` (role refresh and Discord DM delivery; keep private)
- `BOT_API_TOKEN`
- optional `WT_PLUGIN_RESOLVER_URL` / `WT_PLUGIN_RESOLVER_TOKEN`
- keep `ALLOW_UNRESOLVED_BANS=false`

Frontend:

- `VITE_API_BASE`

Bot:

- `DISCORD_BOT_TOKEN`
- `BACKEND_URL`
- `BOT_API_TOKEN`
- `GUILD_ID`
- `MAP_VOTE_AUTO_START` (defaults to true)
- `MAP_VOTE_ROUND_SECONDS` (defaults to 900)


## War Thunder ID resolver

The preferred path is for the War Thunder plugin to post stable IDs to
`/api/bot/playerlist` or `/api/bot/resolve-player`. The panel stores those
aliases and uses them when a moderator enters a name, so renames cannot bypass
an active ban. A separate resolver service can be called by setting
`WT_PLUGIN_RESOLVER_URL` and optionally `WT_PLUGIN_RESOLVER_TOKEN`.

The legacy Python fallback remains available when Python is installed. When a
mod enters a name without an ID, it checks the plain name plus `@live` and
`@psn`; every distinct exact match is banned. Install the Python dependency in
the root application environment:

```bash
python -m pip install -r requirements.txt
```

On Linux, set this in the root `.env` if needed:

```env
PYTHON_BIN=python3
```

On Windows, use:

```env
PYTHON_BIN=python
```

To test the resolver without starting the site:

```bash
python scripts/resolve_wt_user.py SomePlayerName
```

If it prints an `id`, the ban API will store that ID when a mod bans by username.
Production bans reject username-only results by default; only set
`ALLOW_UNRESOLVED_BANS=true` for a temporary testing environment.
