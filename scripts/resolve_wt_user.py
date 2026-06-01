#!/usr/bin/env python3
"""
Resolve a War Thunder nickname to a stable user ID using wt-profile-tool.

Install dependency from the project root or backend folder:
    python -m pip install -r requirements.txt

Usage:
    python scripts/resolve_wt_user.py SomePlayerName

Outputs JSON to stdout:
    {"ok": true, "id": "123", "username": "SomePlayerName", ...}
"""
from __future__ import annotations

import json
import sys
from typing import Any, Dict, Optional, Tuple


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
    # We return it but mark match_type so the backend/UI can audit it.
    user_id, nick = next(iter(id_nick_map.items()))
    return str(user_id), str(nick), "prefix_first_result"


def main() -> None:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        fail("username_required", "Pass a War Thunder nickname as the first argument.")

    username = sys.argv[1].strip()

    try:
        from wt_profile_tool import WTPTClient
    except Exception as exc:  # pragma: no cover - depends on local install
        fail(
            "missing_dependency",
            "Python package wt-profile-tool is not installed. Run: python -m pip install -r requirements.txt",
            details=str(exc),
        )

    try:
        client = WTPTClient(random_ua=True)
        data = client.get_player_userid_by_prefix_nick(username)
        id_nick_map = getattr(data, "id_nick_map", None) or {}
        user_id, nick, match_type = choose_match(id_nick_map, username)

        if not user_id:
            fail("not_found", f"No War Thunder user ID found for {username}.", details={"results": id_nick_map})

        print(json.dumps({
            "ok": True,
            "id": user_id,
            "username": nick or username,
            "requestedUsername": username,
            "matchType": match_type,
            "raw": {"idNickMap": id_nick_map},
        }, ensure_ascii=False))
    except SystemExit:
        raise
    except Exception as exc:
        fail("lookup_failed", "War Thunder profile lookup failed.", details=str(exc))


if __name__ == "__main__":
    main()
