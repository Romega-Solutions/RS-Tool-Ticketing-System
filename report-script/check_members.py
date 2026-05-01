"""
Check Plane.so workspace members/users.

Usage:
  python check_members.py
  python check_members.py --show-all
  python check_members.py --debug
"""

import argparse
import json
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

PLANE_BASE_URL = os.getenv("PLANE_BASE_URL", "").rstrip("/")
PLANE_API_KEY = os.getenv("PLANE_API_KEY", "")
PLANE_WORKSPACE_SLUG = os.getenv("PLANE_WORKSPACE_SLUG", "romega")


def extract_user(item: dict) -> dict:
    """Normalize member payload across possible API response shapes."""
    if not isinstance(item, dict):
        return {}
    return item.get("member") or item.get("user") or item


def get_members() -> list[dict]:
    if not PLANE_BASE_URL or not PLANE_API_KEY:
        raise ValueError(
            "PLANE_BASE_URL and PLANE_API_KEY must be set in .env (see .env.example)."
        )

    url = f"{PLANE_BASE_URL}/api/v1/workspaces/{PLANE_WORKSPACE_SLUG}/members/"
    headers = {
        "X-API-Key": PLANE_API_KEY,
        "Content-Type": "application/json",
    }

    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()

    data = resp.json()
    members = data.get("results", data) if isinstance(data, dict) else data
    return members if isinstance(members, list) else []


def main() -> None:
    parser = argparse.ArgumentParser(description="Check how many users/members exist in Plane workspace.")
    parser.add_argument("--show-all", action="store_true", help="Print all detected users (name/email/id).")
    parser.add_argument("--debug", action="store_true", help="Print raw API payload for debugging.")
    args = parser.parse_args()

    try:
        members = get_members()
    except Exception as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    print(f"Workspace: {PLANE_WORKSPACE_SLUG}")
    print(f"Total members/users: {len(members)}")

    if args.show_all:
        print("\nMembers:")
        for idx, item in enumerate(members, start=1):
            user = extract_user(item)
            user_id = user.get("id", "-")
            name = user.get("display_name") or user.get("name") or "-"
            email = user.get("email") or "-"
            print(f"{idx}. {name} | {email} | id={user_id}")

    if args.debug:
        print("\nRaw API payload:")
        print(json.dumps(members, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
