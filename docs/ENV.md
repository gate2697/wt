# Environment setup

This project now uses one local `.env` file in the project root.

```txt
cb-ban-panel/.env
```

Start by copying:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
copy .env.example .env
```

Fill in Discord, bot, resolver, SMTP, and URL settings inside that one file.

Moderation roles are matched by Discord role ID or resolved role name. The
highest matching role wins:

```env
CB_TRIAL_MOD_PERMS=
CB_MOD_PERMS=
CB_HMOD_PERMS=
# Comma-separated: every role listed here shares the top Admin level.
CB_ADMIN_PERMS=
CB_HEAD_ADMIN_PERMS=
CB_OWNER_PERMS=
# Comma-separated Discord role IDs or names allowed to manage the map catalogue.
CB_MAP_CREATOR_PERMS=
```

Trial Mods are limited to 24-hour bans, Mods to 3-day bans, and HMods and the
admin/owner roles can create permanent bans. With `DISCORD_BOT_TOKEN` set, the
site rechecks the member's roles about once per minute while they are signed in.
Only HMods and higher can process unban requests. Expired or externally revoked
bans keep their pending requests in the queue as stale records until staff
close them.

Staff applications enforce 18+ and 30 days in the Discord server by default.
Those non-secret thresholds can be adjusted with `STAFF_MINIMUM_AGE` and
`STAFF_MINIMUM_GUILD_DAYS` if the community policy changes. UI appearance
settings are stored per browser and do not require additional environment
values. `DISCORD_BOT_TOKEN` also enables direct messages for unban request
confirmations, staff-application updates, HMod+ conversation replies, and
linked-account ban notices. Discord failures are recorded with a reason and do
not prevent the site request or its in-site notification from being saved.

Map creators use `CB_MAP_CREATOR_PERMS`. HMods and higher can also manage the
catalogue as an operational fallback. Map artwork can be uploaded (up to 10
MB) or referenced by an HTTPS URL; uploaded files stay outside the public
document root.

Ban requests require a stable War Thunder player ID by default so a nickname
change cannot bypass enforcement. The War Thunder plugin can send resolved IDs
to `/api/bot/playerlist` or `/api/bot/resolve-player`; a separate resolver can
be configured with `WT_PLUGIN_RESOLVER_URL` and `WT_PLUGIN_RESOLVER_TOKEN`.
Keep `ALLOW_UNRESOLVED_BANS=false` in production.

The canonical Plesk application loads the root `.env` automatically. The
legacy `backend/` and `frontend/` folders are not used by `server.cjs`; do not
copy their old environment files into the production document root. The bot
may use its own environment only when it is hosted as a separate process.

For Vercel, do not upload `.env`. Put production environment variables in Vercel Project Settings instead.
