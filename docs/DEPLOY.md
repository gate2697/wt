# Deploy Notes

For production:

- Set `SESSION_SECRET` to a long random value.
- Use HTTPS and set secure cookies in `backend/src/server.js`.
- Put backend behind a reverse proxy such as Nginx/Caddy.
- Use a real database if this grows beyond a small group. SQLite is fine for testing and small moderation teams.
- Keep `BOT_API_TOKEN` private. Rotate it if it leaks.
- Only enable the StatShark adapter after you have permission and a stable endpoint.

## Environment checklist

Backend:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_GUILD_ID`
- `CB_MOD_PERMS`
- `CB_HMOD_PERMS`
- `CB_HIGHMOD_PERMS`
- `BOT_API_TOKEN`
- optional `STATSHARK_LOOKUP_URL`

Frontend:

- `VITE_API_BASE`

Bot:

- `DISCORD_BOT_TOKEN`
- `BACKEND_URL`
- `BOT_API_TOKEN`
- `GUILD_ID`


## Python War Thunder resolver

The backend uses `scripts/resolve_wt_user.py` to resolve War Thunder usernames into account IDs. Install the Python dependency on the same machine/container as the backend:

```bash
python -m pip install -r requirements.txt
```

On Linux, set this in `backend/.env` if needed:

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
