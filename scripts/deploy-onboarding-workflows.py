#!/usr/bin/env python3
"""
Deploy the four MVP Internal Onboarding n8n workflows via the REST API.

Reads N8N_API_URL + N8N_API_KEY from .env, then for each JSON file under
n8n/Romega Onboarding — *.json:

  * Skips if a workflow with the same name already exists on the server.
  * POSTs the workflow (inactive — Gmail credential still needs to be wired
    up in the n8n UI before activating).
  * Prints the new workflow ID and the production webhook URL the Next.js
    app expects in .env (N8N_BG_CHECK_INITIATE_URL etc.).

Usage:
    python3 scripts/deploy-onboarding-workflows.py [--update]

    --update  If a workflow with the same name already exists, PUT to replace
              it instead of skipping. Use after editing the JSON.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
N8N_DIR  = ROOT / "n8n"

WORKFLOWS = [
    ("Romega Onboarding — BG Check Initiate.json",       "N8N_BG_CHECK_INITIATE_URL"),
    ("Romega Onboarding — Reference Request.json",       "N8N_REFERENCE_REQUEST_URL"),
    ("Romega Onboarding — Employment Verification.json", "N8N_EMPLOYMENT_VERIFICATION_URL"),
    ("Romega Onboarding — Welcome.json",                 "N8N_ONBOARDING_WELCOME_URL"),
]

# Fields n8n's POST/PUT endpoint rejects on create (read-only or computed
# server-side). We strip these from the local JSON before sending.
STRIP_TOP_LEVEL = {"id", "versionId", "active", "tags", "shared", "createdAt",
                   "updatedAt", "triggerCount", "isArchived", "meta",
                   "pinData", "staticData", "homeProject"}


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        out[key.strip()] = val.strip().strip('"').strip("'")
    return out


def api_url(base: str, path: str) -> str:
    return base.rstrip("/") + "/" + path.lstrip("/")


def request_json(method: str, url: str, key: str, body: dict | None = None) -> tuple[int, dict | None]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"X-N8N-API-KEY": key, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urlrequest.Request(url, data=data, method=method, headers=headers)
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            payload = resp.read().decode("utf-8") or "{}"
            return resp.status, json.loads(payload) if payload.strip() else None
    except HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body_text) if body_text else None
        except json.JSONDecodeError:
            parsed = {"raw": body_text}
        return e.code, parsed


def find_workflow_by_name(base: str, key: str, name: str) -> dict | None:
    code, body = request_json("GET", api_url(base, "/workflows?limit=250"), key)
    if code != 200 or not isinstance(body, dict):
        return None
    for w in body.get("data", []):
        if w.get("name") == name:
            return w
    return None


def webhook_production_url(base: str, workflow_json: dict) -> str | None:
    # Pull the Webhook node's path; combine with the host's /webhook/ prefix.
    host = base.split("/api/")[0]
    for node in workflow_json.get("nodes", []):
        if node.get("type") == "n8n-nodes-base.webhook":
            params = node.get("parameters") or {}
            path = params.get("path")
            if path:
                return f"{host}/webhook/{path}"
    return None


def prepare_payload(local_json: dict) -> dict:
    payload = {k: v for k, v in local_json.items() if k not in STRIP_TOP_LEVEL}
    # n8n requires `settings` to exist; default if missing.
    payload.setdefault("settings", {"executionOrder": "v1"})
    # Strip per-node read-only fields the API doesn't accept.
    nodes = []
    for n in payload.get("nodes", []):
        nn = {k: v for k, v in n.items() if k not in {"webhookId"}}
        nodes.append(nn)
    payload["nodes"] = nodes
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--update", action="store_true",
                        help="Replace existing workflow with the same name.")
    args = parser.parse_args()

    env = {**os.environ, **load_env(ENV_FILE)}
    base = env.get("N8N_API_URL", "").strip()
    key  = env.get("N8N_API_KEY", "").strip()
    if not base or not key:
        print("ERROR: N8N_API_URL / N8N_API_KEY missing from environment", file=sys.stderr)
        return 2

    print(f"Connecting to n8n: {base}")
    code, body = request_json("GET", api_url(base, "/workflows?limit=1"), key)
    if code != 200:
        print(f"ERROR: API connectivity failed (HTTP {code}): {body}", file=sys.stderr)
        return 2
    print("Connection OK.\n")

    summary: list[tuple[str, str, str]] = []   # (env_var, status, value)
    for filename, env_var in WORKFLOWS:
        path = N8N_DIR / filename
        if not path.exists():
            print(f"  SKIP  {filename} — file not found")
            summary.append((env_var, "missing", str(path)))
            continue

        with path.open() as f:
            local = json.load(f)
        name = local.get("name") or filename

        existing = find_workflow_by_name(base, key, name)

        if existing and not args.update:
            url = webhook_production_url(base, local)
            print(f"  EXISTS  {name} → id={existing.get('id')}  (use --update to replace)")
            if url:
                summary.append((env_var, "exists", url))
            continue

        payload = prepare_payload(local)

        if existing and args.update:
            wf_id = existing.get("id")
            print(f"  UPDATE  {name} → PUT id={wf_id}")
            code, body = request_json("PUT", api_url(base, f"/workflows/{wf_id}"), key, payload)
            if code not in (200, 201):
                print(f"    FAIL (HTTP {code}): {body}")
                summary.append((env_var, f"PUT {code}", json.dumps(body)[:200]))
                continue
            url = webhook_production_url(base, local) or ""
            print(f"    OK — webhook: {url}")
            summary.append((env_var, "updated", url))
        else:
            print(f"  CREATE  {name}")
            code, body = request_json("POST", api_url(base, "/workflows"), key, payload)
            if code not in (200, 201):
                print(f"    FAIL (HTTP {code}): {body}")
                summary.append((env_var, f"POST {code}", json.dumps(body)[:200]))
                continue
            new = body if isinstance(body, dict) else {}
            wf_id = new.get("id") or new.get("data", {}).get("id") or "?"
            url = webhook_production_url(base, local) or ""
            print(f"    OK — id={wf_id}  webhook: {url}")
            summary.append((env_var, "created", url))

    print("\n=== Summary ===")
    for env_var, status, value in summary:
        print(f"  [{status:>8}]  {env_var}={value}")

    print("\nNext steps in n8n UI:")
    print("  1. Open each newly-created workflow.")
    print("  2. On the Gmail node, set its credential to your Gmail OAuth (e.g. onboarding@romega-solutions.com).")
    print("  3. Activate each workflow.")
    print("  4. Paste the webhook URLs above into .env / Vercel env vars.")
    print("  5. Go to /onboarders/setup and click Test next to each workflow.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
