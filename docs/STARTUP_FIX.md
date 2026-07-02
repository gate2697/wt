# Passenger startup fix

The web process no longer executes database migrations during startup.

Plesk settings:

- Application root: folder containing `server.cjs`
- Document root: `public`
- Application startup file: `server.cjs`
- Application mode: `production`

After deployment:

1. Run **NPM Install**.
2. Run `npm run migrate` once from the Plesk Node.js command runner or SSH.
3. Restart the application.
4. Test `/health`, `/auth/me`, and `/auth/discord` in that order.

Expected logged-out `/auth/me` response:

```json
{"user":null}
```
