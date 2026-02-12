#!/usr/bin/env python3
"""
Email sender via Resend API
SAFETY: Only sends to ALLOWED_RECIPIENTS
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

# API config - loaded from environment or file
API_KEY_FILE = os.path.expanduser("~/.openclaw/.secrets/resend_api_key")
API_KEY = os.environ.get("RESEND_API_KEY") or open(API_KEY_FILE).read().strip() if os.path.exists(API_KEY_FILE) else None

DEFAULT_FROM = "Gavin <gavin@leadcasa.com.br>"


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
    
    if not API_KEY:
        return {
            "success": False,
            "error": "No API key found. Set RESEND_API_KEY or create ~/.openclaw/.secrets/resend_api_key"
        }
    
    payload = {
        "from": DEFAULT_FROM,
        "to": [to],
        "subject": subject,
    }
    
    if html:
        payload["html"] = body
    else:
        payload["text"] = body
    
    data = json.dumps(payload).encode('utf-8')
    
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=data,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "Gavin/1.0"  # Cloudflare needs User-Agent
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            return {"success": True, "id": result.get("id")}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
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
