# API Examples

## Create a ban

```bash
curl -X POST http://localhost:4000/api/bans \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"username":"TargetName","reason":"Teamkilling","durationHours":72}'
```

Requires a logged-in Discord session with Trial Mod permissions or higher.

The server enforces the role ceiling even if a client submits a larger value:

| rank | maximum ban |
| --- | --- |
| Trial Mod | 24 hours |
| Mod | 3 days |
| HMod, Admin, Head Admin, Owner | permanent |

New Trial/Mod/HMod bans are ban requests with `review_status: "pending"`. A
strictly higher rank can decide them with `POST /api/bans/:id/request/decision`:

```json
{"decision":"approve","reason":"Reviewed evidence"}
```

Use `decision: "reject"` with a reason to revoke the ban. Review and creator
identity are included in active/history responses.

## Bot posts playerlist

```bash
curl -X POST http://localhost:4000/api/bot/playerlist \
  -H "Authorization: Bearer change-me-bot-token" \
  -H "Content-Type: application/json" \
  -d '{"source":"warthunder-bot","players":[{"username":"TargetName","warthunderId":"12345"}]}'
```

The plugin may also push one resolved player as soon as it learns the stable
ID:

```bash
curl -X POST http://localhost:4000/api/bot/resolve-player \
  -H "Authorization: Bearer change-me-bot-token" \
  -H "Content-Type: application/json" \
  -d '{"username":"TargetName","warthunderId":"12345"}'
```

The panel stores this alias and reuses the ID during ban-request resolution,
so a later War Thunder nickname change does not bypass the ban.

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

Public results include `duration_hours`, `duration_label`, `starts_at`,
`ends_at`, and the recorded `reason` for every active match. Alias names for a
known War Thunder ID are also checked.

## Staff records

```http
GET /api/bans/active?search=Target&page=1&limit=15
GET /api/bans/requests
GET /api/bans/history?limit=80
GET /api/bans/:id/audit
```

The unified Mod Panel uses these endpoints to show who banned whom, the
creator's rank, request state, evidence, and the audit trail. Trial Mods, Mods,
and HMods create ban requests; a strictly higher rank approves or rejects the
request before it becomes visible to the public lookup or bot enforcement.
Active bans support a case-insensitive search and paginated responses capped at
15 records per page. HMods and higher can edit or revoke bans subject to the
rank hierarchy. `/api/bans/review` remains a compatibility alias.

Ban creation accepts multipart form data with an optional `evidence` field.
Up to 10 files may be attached, with a 100 MB total limit. Files are kept
outside the public document root and only authenticated moderators can open
them through the returned evidence URLs.

## Unban requests and notifications

Players sign in with Discord, submit an appeal against an active ban, and see
the result in their account inbox:

```http
POST /api/unban-requests
GET /api/unban-requests/mine
GET /api/notifications
POST /api/notifications/:id/read
POST /api/notifications/read-all
```

HMods and higher see pending appeals in the unified panel and can decide a
request for any player with a required reason. The queue is searchable and
paginated at 15 records per page. Requests stay pending when their ban expires
or is revoked outside the appeal flow; the queue marks those records as stale
until a moderator closes them.

Each appeal also has a private conversation between the requester and HMod+
staff. Either side can read or post messages with:

```http
GET /api/unban-requests/:id/messages
POST /api/unban-requests/:id/messages
Content-Type: application/json

{"body":"Could you add the match replay link?"}
```

The other side receives an in-site notification for every new message. When
`DISCORD_BOT_TOKEN` is configured, the requester also receives a Discord DM
for the initial appeal, every HMod+ reply, and the final approve/deny decision.
The requester page shows whether each DM was sent; if Discord blocks or cannot
receive it, the exact reason is shown there and the in-site inbox remains the
fallback.

```http
GET /api/unban-requests?search=Target&page=1&limit=15
POST /api/unban-requests/:id/decision
Content-Type: application/json

{"decision":"approve","reason":"Evidence reviewed and ban lifted."}
```

Approving revokes the active ban and notifies the requester. Denying leaves the
ban active and sends the denial reason to the requester's notification inbox.

## Staff applications

Any signed-in Discord member can submit a staff application after the server
confirms both rules: age 18+ and at least 30 days in the locked Discord guild.
The server receives the join date from Discord; the submitted birth date is
used for the calculation and only the resulting age is stored.

```http
POST /api/staff-applications
GET /api/staff-applications/mine
GET /api/staff-applications?search=alex&page=1&limit=15
POST /api/staff-applications/:id/decision
```

Trial Mods and above can read the queue. HMods and above can approve or deny
applications with a reason. Approval records the decision and notifies the
applicant; assigning the Discord role remains an administrator action. With
`DISCORD_BOT_TOKEN`, the applicant also receives a DM when the application is
submitted and when it is approved or denied. Delivery status and any Discord
failure reason are returned on the applicant's records page.

## Community ban requests

Signed-in members can report a player for moderator review without creating a
ban directly:

```http
POST /api/ban-requests
GET /api/ban-requests/mine
GET /api/ban-requests?search=target&page=1&limit=15
POST /api/ban-requests/:id/decision
```

Trial Mods and above can review these requests. Accepting records that the
report was accepted for moderation and notifies the requester; it does not
automatically impose a ban.

## Public map votes

Anyone can read the current round and cast one vote per round. A map that is
currently running is excluded from the candidate list. Anonymous voters use a
signed browser session token; signed-in Discord users are additionally limited
by their Discord account.

```http
GET /api/map-votes/current
POST /api/map-votes/vote
Content-Type: application/json

{"mapId": 12}
```

The bot controls the round clock with the protected bot token:

```http
GET /api/map-votes/bot/state
POST /api/map-votes/bot/end
POST /api/map-votes/bot/start
Content-Type: application/json

{"currentMapId": 12, "durationSeconds": 900}
```

`POST /api/map-votes/bot/end` returns vote totals, the selected map, its
`server_link`, and `selectionReason`. The highest-vote map wins; ties are
randomized, and a round with zero votes is randomized from the eligible active
maps. The bot can then start the next round with the selected/current map ID.

Users whose Discord member roles match `CB_MAP_CREATOR_PERMS` can open the Map
Creator page and add a name, image, and server link. HMods and higher retain
catalogue access as a recovery/admin capability. The management endpoints are:

```http
GET /api/maps/manage
POST /api/maps              # multipart: name, serverLink, image or imageUrl
PATCH /api/maps/:id         # {"active": false}
GET /api/maps               # public active catalogue
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

### Multi-account War Thunder username lookup

When a mod enters `SomeName`, the resolver checks all of these before saving the ban:

```txt
SomeName
SomeName@live
SomeName@psn
```

Every distinct exact/case-insensitive matching War Thunder ID is returned and
the ban API creates one ban record per ID. If the same ID appears for more than
one lookup variant, it is deduplicated. Prefix fallbacks are only used when no
exact match exists, and the response includes `bans`, `createdCount`, and the
resolved account list while keeping `ban` as the first record for compatibility.

## Ban notifications and account links

`POST /api/bans` now attempts notifications after the ban is saved.

Notification behavior:

- Looks for `player_links.service_name = "warthunder"` matching the resolved War Thunder ID or exact username.
- Sends a Discord DM if the linked user has a Discord account and the root
  `.env` has `DISCORD_BOT_TOKEN`.
- Sends an email if the linked user has an email from Discord OAuth and SMTP env is configured.
- Logs each attempt in `notification_log`.
- Ban creation still succeeds even if Discord DMs or email fail.

Linked-account ban DMs include the matched War Thunder username, stable player
ID, reason, duration, and start/end times. A lower-rank ban request sends this
notice only after a higher rank approves it; a direct HMod+ ban sends it as
soon as the ban is saved. A user linked by stable ID continues to receive the
notice after a War Thunder nickname change.

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

When `DISCORD_REQUIRE_GUILD_MEMBERSHIP=true`, Discord OAuth login fails unless the user is a member of that guild. Panel permissions use the highest matching role from `CB_TRIAL_MOD_PERMS`, `CB_MOD_PERMS`, `CB_HMOD_PERMS`, `CB_ADMIN_PERMS`, `CB_HEAD_ADMIN_PERMS`, and `CB_OWNER_PERMS`. Comma-separated role IDs are supported in every mapping. While signed in, `GET /auth/me?refresh=1` rechecks Discord roles (throttled to about once per minute) when `DISCORD_BOT_TOKEN` is configured.

## Frontend panel layout

The public lookup is the base page (`/`). After Discord login, the account button opens a menu with Public lookup, Mod Panel (`/mod`, when allowed), Linking (`/link`), and Logout. All moderation levels share one role-aware panel; higher ranks see review, edit/revoke, history, and audit controls. The live player list stays on the right side of that panel and auto-refreshes every 10 seconds. Custom ban reasons are client-side shortcuts saved in cookies and are not shared between moderators.
