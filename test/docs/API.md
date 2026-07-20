# API Examples

## Create a ban

```bash
curl -X POST http://localhost:4000/api/bans \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"username":"TargetName","reason":"Teamkilling","durationHours":72}'
```

Requires a logged-in Discord session with mod permissions.

## Bot posts playerlist

```bash
curl -X POST http://localhost:4000/api/bot/playerlist \
  -H "Authorization: Bearer change-me-bot-token" \
  -H "Content-Type: application/json" \
  -d '{"source":"warthunder-bot","players":[{"username":"TargetName","warthunderId":"12345"}]}'
```

## Bot checks one player

```bash
curl -X POST http://localhost:4000/api/bot/check-ban \
  -H "Authorization: Bearer change-me-bot-token" \
  -H "Content-Type: application/json" \
  -d '{"username":"TargetName","warthunderId":"12345"}'
```

Response:

```json
{ "banned": true, "action": "kick", "ban": { "reason": "..." } }
```

## Public lookup

```bash
curl http://localhost:4000/api/public/bans/TargetName
```


## War Thunder resolver behavior

When `POST /api/bans` receives a `username` and no `warthunderId`, the backend tries to resolve the ID automatically using `wt-profile-tool` through `scripts/resolve_wt_user.py`.

The resolver tries lookup names in this order when the submitted name has no platform suffix:

1. `username`
2. `username@live`
3. `username@psn`

For each lookup name, it prefers:

1. exact nickname match,
2. case-insensitive exact match,
3. first prefix result.

The full resolver payload is stored in audit data, including `resolvedLookupName`, `usedFallback`, and `attemptedUsernames`, so you can check whether it resolved the plain name or a platform-suffixed account. For serious moderation, ask mods to verify prefix fallback matches before enforcing the ban.

### Duplicate-safe War Thunder username lookup

When a mod enters `SomeName`, the resolver checks all of these before saving the ban:

```txt
SomeName
SomeName@live
SomeName@psn
```

If only one unique War Thunder ID is found, the ban is saved with that ID. If more than one unique ID is found, the ban API rejects the lookup with `duplicate_accounts_found` so a mod can enter the exact suffixed name or manually provide the War Thunder ID. This prevents accidentally banning `SomeName` when the intended player was `SomeName@live`, or the other way around.

## Ban notifications and account links

`POST /api/bans` now attempts notifications after the ban is saved.

Notification behavior:

- Looks for `player_links.service_name = "warthunder"` matching the resolved War Thunder ID or exact username.
- Sends a Discord DM if the linked user has a Discord account and `backend/.env` has `DISCORD_BOT_TOKEN`.
- Sends an email if the linked user has an email from Discord OAuth and SMTP env is configured.
- Logs each attempt in `notification_log`.
- Ban creation still succeeds even if Discord DMs or email fail.

Create a War Thunder link code while logged in:

```http
POST /api/link-codes
Content-Type: application/json

{
  "serviceName": "warthunder",
  "minutesValid": 15
}
```

Claim a link code from your War Thunder bot/external service after verifying ownership:

```http
POST /api/link-codes/claim
Content-Type: application/json

{
  "code": "ABCD1234",
  "serviceName": "warthunder",
  "externalId": "62681955",
  "externalUsername": "gatetheproto"
}
```

List current user's links:

```http
GET /api/link-codes/me
```


## Discord server lock

The backend defaults to the CB Discord server:

```env
DISCORD_GUILD_ID=1495608662025048125
DISCORD_REQUIRE_GUILD_MEMBERSHIP=true
```

When `DISCORD_REQUIRE_GUILD_MEMBERSHIP=true`, Discord OAuth login fails unless the user is a member of that guild. Panel permissions are still based on `cbmodperms`, `cbhmodperms`, and `highmodperms`.

## Frontend panel layout

The frontend has tabbed pages for Public, Mod, HMod, High Mod, and Linking. The live player list stays on the right side and auto-refreshes every 10 seconds. Custom ban reasons are client-side shortcuts saved in cookies and are not shared between moderators.
