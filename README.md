# CB Ban Panel — Plesk Native Build

This version is rebuilt to run cleanly as a single Plesk/Passenger Node.js web app.

## What changed

- Native Plesk startup file: `server.cjs`
- React frontend served from the same domain through `public/`
- Discord OAuth route: `/auth/discord`
- OAuth callback: `/auth/discord/callback`
- Auth status: `/auth/me` and `/api/auth/me`
- MySQL/MariaDB storage and automatic migration script
- Role permissions now support Discord role IDs **and** role names
- UI redesigned with cleaner mod, HMod, High Mod, public lookup, linking, and live-player panels
- No Vercel proxy, no fixed port, no manually configured listener port

Read `docs/PLESK_PASSENGER.md` before uploading.
