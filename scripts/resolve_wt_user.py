#!/usr/bin/env python3
"""
Resolve a War Thunder nickname to a stable user ID using wt-profile-tool.

Install dependency from the project root or backend folder:
    python -m pip install -r requirements.txt

Usage:
    python scripts/resolve_wt_user.py SomePlayerName

Outputs JSON to stdout:
    {"ok": true, "id": "123", "username": "SomePlayerName", ...}

Duplicate-safe behavior:
- If the input has no suffix, this tries:
    name
    name@live
    name@psn
- It checks every successful exact/case-insensitive exact result.
- If multiple different IDs exist, it returns every distinct matching account so
  the site can create one ban per account instead of silently choosing one.
"""
from __future__ import annotations

import json
import sys
from typing import Any, Dict, List, Tuple

SAFE_MATCH_TYPES = {"exact", "case_insensitive_exact"}


def fail(code: str, message: str, *, details: Any = None, exit_code: int = 1) -> None:
    payload: Dict[str, Any] = {"ok": False, "error": code, "message": message}
    if details is not None:
        payload["details"] = details
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(exit_code)


def choose_matches(id_nick_map: Dict[str, str], username: str) -> List[Tuple[str, str, str]]:
    """Return every exact match, or one safe fallback when no exact match exists."""
    if not id_nick_map:
        return []

    exact = [
        (str(user_id), str(nick), "exact")
        for user_id, nick in id_nick_map.items()
        if str(nick) == username
    ]
    if exact:
        return exact

    wanted = username.casefold()
    case_insensitive = [
        (str(user_id), str(nick), "case_insensitive_exact")
        for user_id, nick in id_nick_map.items()
        if str(nick).casefold() == wanted
    ]
    if case_insensitive:
        return case_insensitive

    # wt-profile-tool's lookup is prefix-based, so a partial match can come back.
    # Expose one fallback for auditing, but prefer every exact result across all
    # platform suffix checks whenever one exists.
    user_id, nick = next(iter(id_nick_map.items()))
    return [(str(user_id), str(nick), "prefix_first_result")]


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
    matches = choose_matches(id_nick_map, lookup_name)

    return {
        "lookupName": lookup_name,
        "matches": [
            {"id": user_id, "username": nick, "matchType": match_type}
            for user_id, nick, match_type in matches
        ],
        "id": matches[0][0] if matches else None,
        "username": matches[0][1] if matches else lookup_name,
        "matchType": matches[0][2] if matches else "none",
        "raw": {"idNickMap": id_nick_map},
    }


def summarize_attempt(result: Dict[str, Any]) -> Dict[str, Any]:
    matches = result.get("matches", [])
    return {
        "lookupName": result.get("lookupName"),
        "ok": bool(matches),
        "id": str(matches[0]["id"]) if matches else None,
        "ids": [str(match["id"]) for match in matches],
        "username": matches[0].get("username") if matches else result.get("username"),
        "matchType": matches[0].get("matchType") if matches else result.get("matchType"),
        "results": result.get("raw", {}).get("idNickMap", {}),
    }


def choose_final_results(requested_username: str, successes: List[Dict[str, Any]], attempts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return one representative row for every distinct matching account.

    Exact and case-insensitive exact matches are preferred over prefix fallback
    results. This prevents a broad prefix result from adding an unrelated
    account when an exact platform match already exists.
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

    selected: List[Dict[str, Any]] = []
    for rows in by_id.values():
        rows.sort(key=lambda r: (
            0 if r.get("lookupName") == requested_username and r.get("matchType") in SAFE_MATCH_TYPES else
            1 if r.get("matchType") in SAFE_MATCH_TYPES else
            2
        ))
        selected.append(rows[0])
    return selected


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
                for match in result.get("matches", []):
                    successes.append({
                        "lookupName": lookup_name,
                        "id": str(match["id"]),
                        "username": match.get("username") or lookup_name,
                        "matchType": match.get("matchType") or "none",
                        "raw": result.get("raw", {}),
                    })
            except Exception as exc:
                attempts.append({
                    "lookupName": lookup_name,
                    "ok": False,
                    "error": str(exc),
                })

        results = choose_final_results(requested_username, successes, attempts)
        accounts = [
            {
                "id": str(result["id"]),
                "username": result["username"],
                "requestedUsername": requested_username,
                "resolvedLookupName": result["lookupName"],
                "usedFallback": result["lookupName"] != requested_username,
                "matchType": result["matchType"],
                "raw": result["raw"],
            }
            for result in results
        ]
        primary = accounts[0]
        unique_ids = sorted({str(s["id"]) for s in successes if s.get("id")})
        same_id_matches = [
            attempt for attempt in attempts
            if any(str(match_id) == str(primary["id"]) for match_id in attempt.get("ids", []))
        ]

        print(json.dumps({
            "ok": True,
            "id": primary["id"],
            "username": primary["username"],
            "requestedUsername": requested_username,
            "resolvedLookupName": primary["resolvedLookupName"],
            "usedFallback": primary["usedFallback"],
            "matchType": primary["matchType"],
            "attemptedUsernames": [a["lookupName"] for a in attempts],
            "accounts": accounts,
            "duplicateCheck": {
                "checked": True,
                "uniqueMatchingIds": unique_ids,
                "accountCount": len(accounts),
                "sameIdMatches": same_id_matches,
                "ambiguous": False,
            },
            "attempts": attempts,
            "raw": primary["raw"],
        }, ensure_ascii=False))
    except SystemExit:
        raise
    except Exception as exc:
        fail("lookup_failed", "War Thunder profile lookup failed.", details={"error": str(exc), "attempts": attempts})


if __name__ == "__main__":
    main()
