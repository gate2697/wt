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
