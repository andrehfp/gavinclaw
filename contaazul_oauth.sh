#!/usr/bin/env bash
set -euo pipefail

TOKEN_URL="https://auth.contaazul.com/oauth2/token"
REDIRECT_URI_DEFAULT="https://contaazul.com"

echo "=== Conta Azul OAuth helper ==="
read -rp "Client ID: " CLIENT_ID
read -rsp "Client Secret: " CLIENT_SECRET
echo
read -rp "Redirect URI [https://contaazul.com]: " REDIRECT_URI
REDIRECT_URI="${REDIRECT_URI:-$REDIRECT_URI_DEFAULT}"

BASIC="$(printf "%s:%s" "$CLIENT_ID" "$CLIENT_SECRET" | base64 | tr -d '\n')"
echo
echo "1) Abra no navegador e faça login para pegar o code:"
ENC_REDIRECT="$(python3 - <<PY
import urllib.parse
print(urllib.parse.quote("${REDIRECT_URI}", safe=""))
PY
)"
echo "https://auth.contaazul.com/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${ENC_REDIRECT}&state=teste123&scope=openid+profile+aws.cognito.signin.user.admin"
echo
read -rp "Cole o code retornado na URL: " CODE

echo
echo "2) Trocando code por tokens..."
AUTH_RESP="$(curl -sS --request POST "$TOKEN_URL" \
  --header "Authorization: Basic $BASIC" \
  --header "Content-Type: application/x-www-form-urlencoded" \
  --data "grant_type=authorization_code" \
  --data "code=$CODE" \
  --data "redirect_uri=$REDIRECT_URI")"

echo "$AUTH_RESP" | python3 -m json.tool || echo "$AUTH_RESP"

ACCESS_TOKEN="$(echo "$AUTH_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("access_token",""))')"
REFRESH_TOKEN="$(echo "$AUTH_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("refresh_token",""))')"

if [[ -z "$ACCESS_TOKEN" || -z "$REFRESH_TOKEN" ]]; then
  echo
  echo "Falhou ao obter tokens. Verifique client_id/client_secret/code/redirect_uri."
  exit 1
fi

echo
echo "3) Testando refresh token..."
REFRESH_RESP="$(curl -sS --request POST "$TOKEN_URL" \
  --header "Authorization: Basic $BASIC" \
  --header "Content-Type: application/x-www-form-urlencoded" \
  --data "grant_type=refresh_token" \
  --data "refresh_token=$REFRESH_TOKEN")"

echo "$REFRESH_RESP" | python3 -m json.tool || echo "$REFRESH_RESP"

NEW_ACCESS="$(echo "$REFRESH_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("access_token",""))')"
NEW_REFRESH="$(echo "$REFRESH_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("refresh_token",""))')"
EXPIRES_IN="$(echo "$REFRESH_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("expires_in",""))')"

echo
echo "=== ENV sugerido (salve local, fora de git) ==="
echo "CA_OAUTH_BASIC=$BASIC"
echo "CA_ACCESS_TOKEN=${NEW_ACCESS:-$ACCESS_TOKEN}"
echo "CA_REFRESH_TOKEN=${NEW_REFRESH:-$REFRESH_TOKEN}"
echo "CA_TOKEN_EXPIRES_IN=${EXPIRES_IN:-3600}"
echo
echo "Pronto."
