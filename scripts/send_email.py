#!/usr/bin/env python3
"""
Email sender via Resend API
SAFETY: Only sends to ALLOWED_RECIPIENTS

Two domains/keys:
  - moldaspace.com → resend_moldaspace_api_key (for andrehfp@gmail.com, renatacarolsilva@gmail.com)
  - leadcasa.com.br → resend_api_key (for contato@leadcasa.com.br)
"""

import json
import os
import sys
import urllib.request
import urllib.error

# SAFETY GUARDRAILS - Only these emails can receive
ALLOWED_RECIPIENTS = [
    "contato@leadcasa.com.br",
    "andrehfp@gmail.com",
    "renatacarolsilva@gmail.com",
]


def _read_secret(name: str) -> str | None:
    path = os.path.expanduser(f"~/.openclaw/.secrets/{name}")
    return open(path).read().strip() if os.path.exists(path) else None


def _get_config(to: str) -> tuple[str, str]:
    """Return (api_key, from_address) based on recipient domain."""
    if to.lower() == "contato@leadcasa.com.br":
        key = os.environ.get("RESEND_API_KEY") or _read_secret("resend_api_key")
        return key, "Gavin <gavin@leadcasa.com.br>"
    else:
        # moldaspace.com domain for all other allowed recipients
        key = _read_secret("resend_moldaspace_api_key")
        return key, "Gavin <gavin@moldaspace.com>"


def send_email(to: str, subject: str, body: str, html: bool = True) -> dict:
    """
    Send email via Resend API.

    Args:
        to: Recipient email (must be in ALLOWED_RECIPIENTS)
        subject: Email subject
        body: Email body (HTML or plain text)
        html: If True, body is HTML; if False, plain text

    Returns:
        dict with 'success', 'id' or 'error'
    """
    # SAFETY CHECK
    if to.lower() not in [r.lower() for r in ALLOWED_RECIPIENTS]:
        return {
            "success": False,
            "error": f"BLOCKED: '{to}' not in allowed recipients. Only: {ALLOWED_RECIPIENTS}"
        }

    api_key, from_addr = _get_config(to)

    if not api_key:
        return {
            "success": False,
            "error": "No API key found for this recipient."
        }

    payload = {
        "from": from_addr,
        "to": [to],
        "subject": subject,
    }

    if html:
        payload["html"] = body
    else:
        payload["text"] = body

    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Gavin/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
            return {"success": True, "id": result.get("id")}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        return {"success": False, "error": f"HTTP {e.code}: {error_body}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: send_email.py <to> <subject> <body>")
        print(f"Allowed recipients: {ALLOWED_RECIPIENTS}")
        sys.exit(1)

    to = sys.argv[1]
    subject = sys.argv[2]
    body = sys.argv[3]

    result = send_email(to, subject, body)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["success"] else 1)
