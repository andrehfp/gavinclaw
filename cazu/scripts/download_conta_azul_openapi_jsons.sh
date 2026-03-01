#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://developers.contaazul.com"
OUTPUT_DIR="docs/contaazul"

PAGES=(
  "$BASE_URL/aboutapis"
  "$BASE_URL/auth"
  "$BASE_URL/docs/acquittance-apis-openapi"
  "$BASE_URL/docs/charge-apis-openapi"
  "$BASE_URL/docs/contracts-apis-openapi"
  "$BASE_URL/docs/financial-apis-openapi"
  "$BASE_URL/docs/sales-apis-openapi"
  "$BASE_URL/open-api-docs/open-api-inventory"
  "$BASE_URL/open-api-docs/open-api-invoice"
  "$BASE_URL/open-api-docs/open-api-person"
  "$BASE_URL/open-api-docs/open-api-service"
)

mkdir -p "$OUTPUT_DIR"
TMP_URLS="$(mktemp)"

for page in "${PAGES[@]}"; do
  page_html="$(mktemp)"
  curl -fsSL "$page" -o "$page_html"

  rg -o "https?://[^\"' ]+\.json[^\"' ]*|/[^\"' ]+\.json[^\"' ]*" "$page_html" >> "$TMP_URLS" || true

  rm -f "$page_html"
done

sort -u "$TMP_URLS" | while IFS= read -r url; do
  [ -z "$url" ] && continue

  if [[ "$url" == /* ]]; then
    full_url="$BASE_URL$url"
  else
    full_url="$url"
  fi

  relative_path="${full_url#${BASE_URL}/}"
  relative_path="${relative_path%%\?*}"
  destination="$OUTPUT_DIR/$relative_path"

  mkdir -p "$(dirname "$destination")"
  curl -fsSL "$full_url" -o "$destination"
  echo "$destination"
done | sort -u > "$OUTPUT_DIR/downloaded-json-files.txt"

rm -f "$TMP_URLS"

echo "Downloaded $(wc -l < "$OUTPUT_DIR/downloaded-json-files.txt") JSON files to $OUTPUT_DIR"
