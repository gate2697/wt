# CB Ban Panel — Plesk/Passenger build

This is the Plesk-native build of the Discord-linked War Thunder CB ban panel.

- One Passenger-managed Node.js web application
- React frontend served from the same domain
- Discord OAuth login at `/auth/discord`
- MySQL/MariaDB storage
- Ban API, public ban lookup, link codes, live player list, role-based panels, notifications, and War Thunder ID resolver
- No fixed port and no Vercel proxy

Read `docs/PLESK_PASSENGER.md` before deploying.
