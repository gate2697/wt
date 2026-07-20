# CB Ban Panel — Plesk/Passenger

The production app is the code at the repository root. It serves the React build
and Express API from the same `https://golf-cb.xyz` origin.

- Plesk startup file: `server.cjs`
- Static document root: `public/`
- Discord login: `/auth/discord`
- OAuth callback: `/auth/discord/callback`
- Login status: `/auth/me`
- Database: MySQL/MariaDB
- Session storage: signed secure cookie (not the database)

Do **not** point Plesk at the legacy `backend/` directory. Read
`docs/PLESK_PASSENGER.md` for the exact settings and validation commands.
