#!/usr/bin/env python3
"""LinkedIn OAuth2 flow - run this, open the URL in browser, paste the redirect URL back"""
import json
import urllib.request
import urllib.parse
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

CREDS_PATH = "/home/andreprado/.openclaw/.secrets/linkedin_credentials.json"
TOKEN_PATH = "/home/andreprado/.openclaw/.secrets/linkedin_token.json"
REDIRECT_URI = "http://localhost:3000/callback"
SCOPES = "openid profile w_member_social r_member_social"

with open(CREDS_PATH) as f:
    creds = json.load(f)

CLIENT_ID = creds["client_id"]
CLIENT_SECRET = creds["client_secret"]

auth_code = None

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if "code" in params:
            auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>OK! Pode fechar esta aba.</h1>")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Error: no code")
        
    def log_message(self, format, *args):
        pass

# Build auth URL
auth_url = (
    f"https://www.linkedin.com/oauth/v2/authorization"
    f"?response_type=code"
    f"&client_id={CLIENT_ID}"
    f"&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
    f"&scope={urllib.parse.quote(SCOPES)}"
)

print(f"\n🔗 Abre este link no browser:\n\n{auth_url}\n")
print("Aguardando callback em http://localhost:3000/callback ...\n")

server = HTTPServer(("0.0.0.0", 3000), CallbackHandler)
server.timeout = 300
while auth_code is None:
    server.handle_request()

print(f"✅ Código recebido! Trocando por token...")

# Exchange code for token
data = urllib.parse.urlencode({
    "grant_type": "authorization_code",
    "code": auth_code,
    "redirect_uri": REDIRECT_URI,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
}).encode()

req = urllib.request.Request(
    "https://www.linkedin.com/oauth/v2/accessToken",
    data=data,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)

try:
    resp = urllib.request.urlopen(req)
    token = json.loads(resp.read())
    with open(TOKEN_PATH, "w") as f:
        json.dump(token, f, indent=2)
    print(f"✅ Token salvo em {TOKEN_PATH}")
    print(f"   Scopes: {token.get('scope', 'unknown')}")
    print(f"   Expira em: {token.get('expires_in', '?')}s")
except urllib.error.HTTPError as e:
    print(f"❌ Erro {e.code}: {e.read().decode()}")
