#!/usr/bin/env python3
"""
Resolve a War Thunder nickname to a stable user ID using wt-profile-tool.

Install dependency from the project root or backend folder:
    python -m pip install -r requirements.txt

Usage:
    python scripts/resolve_wt_user.py SomePlayerName

Outputs JSON to stdout:
    {"ok": true, "id": "123", "username": "SomePlayerName", ...}

Duplicate-safety behavior:
- If the input has no suffix, this tries:
    name
    name@live
    name@psn
- It checks every successful exact/case-insensitive exact result before picking.
- If multiple different IDs exist, it returns duplicate_accounts_found instead of guessing.
"""
from __future__ import annotations

import json
import sys
from typing import Any, Dict, List, Optional, Tuple

SAFE_MATCH_TYPES = {"exact", "case_insensitive_exact"}


def fail(code: str, message: str, *, details: Any = None, exit_code: int = 1) -> None:
    payload: Dict[str, Any] = {"ok": False, "error": code, "message": message}
    if details is not None:
        payload["details"] = details
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(exit_code)


def choose_match(id_nick_map: Dict[str, str], username: str) -> Tuple[Optional[str], Optional[str], str]:
    """Prefer exact match, then case-insensitive exact, then first prefix result."""
    if not id_nick_map:
        return None, None, "none"

    if username in id_nick_map.values():
        for user_id, nick in id_nick_map.items():
            if nick == username:
                return str(user_id), nick, "exact"

    wanted = username.casefold()
    for user_id, nick in id_nick_map.items():
        if str(nick).casefold() == wanted:
            return str(user_id), str(nick), "case_insensitive_exact"

    # wt-profile-tool's lookup is prefix-based, so a partial match can come back.
    # We expose it for auditing, but the duplicate-safe resolver will not prefer it
    # over exact matches unless it is the only usable result.
    user_id, nick = next(iter(id_nick_map.items()))
    return str(user_id), str(nick), "prefix_first_result"


def build_lookup_names(username: str) -> list[str]:
    """Try the plain name, then common platform suffixes.

    War Thunder nicknames for console-linked accounts can include suffixes like
    @live or @psn. If the user already typed a suffix, only check that exact name.
    """
    if "@" in username:
        return [username]
    return [username, f"{username}@live", f"{username}@psn"]


def lookup_once(client: Any, lookup_name: str) -> Dict[str, Any]:
    data = client.get_player_userid_by_prefix_nick(lookup_name)
    id_nick_map = getattr(data, "id_nick_map", None) or {}
    user_id, nick, match_type = choose_match(id_nick_map, lookup_name)

    return {
        "lookupName": lookup_name,
        "id": user_id,
        "username": nick or lookup_name,
        "matchType": match_type,
        "raw": {"idNickMap": id_nick_map},
    }


def summarize_attempt(result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "lookupName": result.get("lookupName"),
        "ok": bool(result.get("id")),
        "id": str(result["id"]) if result.get("id") else None,
        "username": result.get("username"),
        "matchType": result.get("matchType"),
        "results": result.get("raw", {}).get("idNickMap", {}),
    }


def choose_final_result(requested_username: str, successes: List[Dict[str, Any]], attempts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pick one result only when it is safe.

    If both `player` and `player@live` exist as different accounts, this returns
    an error instead of accidentally banning the wrong player.
    """
    if not successes:
        fail(
            "not_found",
            f"No War Thunder user ID found for checked names based on {requested_username}.",
            details={"attempts": attempts},
        )

    exact_successes = [s for s in successes if s.get("matchType") in SAFE_MATCH_TYPES]
    usable = exact_successes or successes

    # Group successful results by stable ID.
    by_id: Dict[str, List[Dict[str, Any]]] = {}
    for item in usable:
        by_id.setdefault(str(item["id"]), []).append(item)

    if len(by_id) > 1:
        duplicate_accounts = [
            {
                "id": user_id,
                "usernames": sorted({str(x.get("username")) for x in rows if x.get("username")}),
                "lookupNames": [str(x.get("lookupName")) for x in rows],
                "matchTypes": sorted({str(x.get("matchType")) for x in rows if x.get("matchType")}),
            }
            for user_id, rows in by_id.items()
        ]
        fail(
            "duplicate_accounts_found",
            "More than one matching War Thunder account exists. Enter the exact name with @live or @psn, or enter the War Thunder ID manually so the wrong person is not banned.",
            details={
                "requestedUsername": requested_username,
                "duplicateAccounts": duplicate_accounts,
                "attempts": attempts,
            },
        )

    # One unique ID is safe. Prefer exact plain-name match, then any exact match,
    # then the first usable fallback/prefix result.
    only_id = next(iter(by_id.keys()))
    rows = by_id[only_id]
    rows.sort(key=lambda r: (
        0 if r.get("lookupName") == requested_username and r.get("matchType") in SAFE_MATCH_TYPES else
        1 if r.get("matchType") in SAFE_MATCH_TYPES else
        2
    ))
    return rows[0]


def main() -> None:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        fail("username_required", "Pass a War Thunder nickname as the first argument.")

    requested_username = sys.argv[1].strip()

    try:
        from wt_profile_tool import WTPTClient
    except Exception as exc:  # pragma: no cover - depends on local install
        fail(
            "missing_dependency",
            "Python package wt-profile-tool is not installed. Run: python -m pip install -r requirements.txt",
            details=str(exc),
        )

    attempts: List[Dict[str, Any]] = []
    successes: List[Dict[str, Any]] = []

    try:
        client = WTPTClient(random_ua=True)

        for lookup_name in build_lookup_names(requested_username):
            try:
                result = lookup_once(client, lookup_name)
                attempts.append(summarize_attempt(result))
                if result.get("id"):
                    successes.append(result)
            except Exception as exc:
                attempts.append({
                    "lookupName": lookup_name,
                    "ok": False,
                    "error": str(exc),
                })

        result = choose_final_result(requested_username, successes, attempts)
        duplicate_same_id = [a for a in attempts if a.get("ok") and str(a.get("id")) == str(result["id"])]

        print(json.dumps({
            "ok": True,
            "id": str(result["id"]),
            "username": result["username"],
            "requestedUsername": requested_username,
            "resolvedLookupName": result["lookupName"],
            "usedFallback": result["lookupName"] != requested_username,
            "matchType": result["matchType"],
            "attemptedUsernames": [a["lookupName"] for a in attempts],
            "duplicateCheck": {
                "checked": True,
                "uniqueMatchingIds": sorted({str(s["id"]) for s in successes if s.get("id")}),
                "sameIdMatches": duplicate_same_id,
                "ambiguous": False,
            },
            "attempts": attempts,
            "raw": result["raw"],
        }, ensure_ascii=False))
    except SystemExit:
        raise
    except Exception as exc:
        fail("lookup_failed", "War Thunder profile lookup failed.", details={"error": str(exc), "attempts": attempts})


if __name__ == "__main__":
    main()
