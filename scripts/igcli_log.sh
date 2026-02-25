#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <job-tag> <command...>" >&2
  exit 2
fi

JOB_TAG="$1"
shift
CMD=("$@")

LOG_ROOT="/home/andreprado/.openclaw/workspace/logs/instacli"
STATE_ROOT="/home/andreprado/.openclaw/workspace/logs/instacli_state"
DATE_DIR="$(date +%F)"
mkdir -p "$LOG_ROOT/$DATE_DIR" "$STATE_ROOT"
LOG_FILE="$LOG_ROOT/$DATE_DIR/${JOB_TAG}.log"

TMP_OUT="$(mktemp)"
TMP_ERR="$(mktemp)"
TMP_META="$(mktemp)"
START_ISO="$(date -Is)"
CMD_STR="$(printf '%q ' "${CMD[@]}")"

log_meta() {
  printf '[%s] META: %s\n' "$(date -Is)" "$*" >>"$TMP_META"
}

extract_arg_value() {
  local key="$1"
  shift
  local prev=""
  for token in "$@"; do
    if [ "$prev" = "$key" ]; then
      printf '%s' "$token"
      return 0
    fi
    prev="$token"
  done
  return 1
}

json_get_retry_after() {
  python3 - <<'PY' "$1"
import json, sys
p = sys.argv[1]
try:
    data = json.loads(open(p, 'r', encoding='utf-8').read() or '{}')
    err = data.get('error', {})
    details = err.get('details', {})
    retry = details.get('retry_after_seconds')
    if isinstance(retry, (int, float)) and retry > 0:
        print(int(retry))
except Exception:
    pass
PY
}

confirm_publish_by_caption() {
  local account="$1"
  local caption="$2"
  local limit="${3:-8}"

  local tmp_list_out
  local tmp_list_err
  tmp_list_out="$(mktemp)"
  tmp_list_err="$(mktemp)"

  set +e
  instacli media list --account "$account" --limit "$limit" --json --quiet >"$tmp_list_out" 2>"$tmp_list_err"
  local list_status=$?
  set -e

  if [ $list_status -ne 0 ]; then
    log_meta "post-check media.list failed status=$list_status"
    if [ -s "$tmp_list_err" ]; then
      log_meta "post-check stderr=$(tr '\n' ' ' <"$tmp_list_err")"
    fi
    rm -f "$tmp_list_out" "$tmp_list_err"
    return 1
  fi

  python3 - <<'PY' "$tmp_list_out" "$caption"
import json, sys
path = sys.argv[1]
caption = sys.argv[2]
try:
    data = json.loads(open(path, 'r', encoding='utf-8').read() or '{}')
    items = data.get('data', {}).get('items', [])
except Exception:
    items = []
for item in items:
    if (item.get('caption') or '').strip() == caption.strip():
        print(json.dumps({
            'id': item.get('id'),
            'permalink': item.get('permalink'),
            'timestamp': item.get('timestamp')
        }, ensure_ascii=False))
        raise SystemExit(0)
raise SystemExit(1)
PY
  local match_status=$?

  rm -f "$tmp_list_out" "$tmp_list_err"
  return $match_status
}

apply_instacli_controls() {
  local account="$1"
  local is_publish="$2"
  local now
  now="$(date +%s)"

  local lock_file="$STATE_ROOT/${account}.lock"
  local actions_file="$STATE_ROOT/${account}.actions.log"
  local publish_last_file="$STATE_ROOT/${account}.publish.last"
  local blocked_until_file="$STATE_ROOT/${account}.blocked_until"
  touch "$actions_file"

  local max_actions_per_hour="${IGCLI_MAX_ACTIONS_PER_HOUR:-12}"
  local min_publish_interval_s="${IGCLI_MIN_PUBLISH_INTERVAL_S:-5400}"
  local jitter_min="${IGCLI_JITTER_MIN_S:-3}"
  local jitter_max="${IGCLI_JITTER_MAX_S:-12}"
  local publish_jitter_min="${IGCLI_PUBLISH_JITTER_MIN_S:-30}"
  local publish_jitter_max="${IGCLI_PUBLISH_JITTER_MAX_S:-120}"

  exec 9>"$lock_file"
  flock 9

  if [ -f "$blocked_until_file" ]; then
    local blocked_until
    blocked_until="$(cat "$blocked_until_file" 2>/dev/null || true)"
    if [[ "$blocked_until" =~ ^[0-9]+$ ]] && [ "$now" -lt "$blocked_until" ]; then
      local wait_s=$((blocked_until - now))
      log_meta "account cooldown active, waiting ${wait_s}s"
      sleep "$wait_s"
      now="$(date +%s)"
    fi
  fi

  awk -v cutoff="$((now - 3600))" '($1+0)>=cutoff {print $1}' "$actions_file" >"${actions_file}.tmp" || true
  mv "${actions_file}.tmp" "$actions_file"
  local action_count
  action_count="$(wc -l <"$actions_file" | tr -d ' ')"

  if [ "$max_actions_per_hour" -gt 0 ] && [ "$action_count" -ge "$max_actions_per_hour" ]; then
    local oldest
    oldest="$(head -n1 "$actions_file" || true)"
    if [[ "$oldest" =~ ^[0-9]+$ ]]; then
      local wait_s=$((oldest + 3600 - now))
      if [ "$wait_s" -gt 0 ]; then
        log_meta "hourly action cap hit ($action_count/$max_actions_per_hour), waiting ${wait_s}s"
        sleep "$wait_s"
        now="$(date +%s)"
        awk -v cutoff="$((now - 3600))" '($1+0)>=cutoff {print $1}' "$actions_file" >"${actions_file}.tmp" || true
        mv "${actions_file}.tmp" "$actions_file"
      fi
    fi
  fi

  if [ "$is_publish" = "1" ] && [ -f "$publish_last_file" ]; then
    local last_publish
    last_publish="$(cat "$publish_last_file" 2>/dev/null || true)"
    if [[ "$last_publish" =~ ^[0-9]+$ ]]; then
      local since=$((now - last_publish))
      if [ "$since" -lt "$min_publish_interval_s" ]; then
        local wait_s=$((min_publish_interval_s - since))
        log_meta "min publish interval active, waiting ${wait_s}s"
        sleep "$wait_s"
        now="$(date +%s)"
      fi
    fi
  fi

  local jmin="$jitter_min"
  local jmax="$jitter_max"
  if [ "$is_publish" = "1" ]; then
    jmin="$publish_jitter_min"
    jmax="$publish_jitter_max"
  fi

  if [ "$jmax" -lt "$jmin" ]; then
    jmax="$jmin"
  fi

  if [ "$jmax" -gt 0 ]; then
    local jitter_range=$((jmax - jmin + 1))
    local sleep_s="$jmin"
    if [ "$jitter_range" -gt 1 ]; then
      sleep_s=$((RANDOM % jitter_range + jmin))
    fi
    if [ "$sleep_s" -gt 0 ]; then
      log_meta "jitter wait ${sleep_s}s"
      sleep "$sleep_s"
    fi
  fi

  printf '%s\n' "$(date +%s)" >>"$actions_file"
  flock -u 9
}

is_instacli=0
is_publish=0
ACCOUNT="default"
CAPTION=""

if [ "${CMD[0]}" = "instacli" ]; then
  is_instacli=1
  if [ "${CMD[1]:-}" = "publish" ]; then
    is_publish=1
  fi
  ACCOUNT="$(extract_arg_value --account "${CMD[@]}" 2>/dev/null || true)"
  CAPTION="$(extract_arg_value --caption "${CMD[@]}" 2>/dev/null || true)"
  [ -z "$ACCOUNT" ] && ACCOUNT="default"

  apply_instacli_controls "$ACCOUNT" "$is_publish"
fi

set +e
"${CMD[@]}" >"$TMP_OUT" 2>"$TMP_ERR"
STATUS=$?
set -e

if [ "$is_instacli" -eq 1 ] && [ "$is_publish" -eq 1 ]; then
  if [ "$STATUS" -eq 0 ]; then
    printf '%s\n' "$(date +%s)" >"$STATE_ROOT/${ACCOUNT}.publish.last"
  else
    if grep -q '2207051' "$TMP_OUT"; then
      retry_after="$(json_get_retry_after "$TMP_OUT" || true)"
      if ! [[ "$retry_after" =~ ^[0-9]+$ ]]; then
        retry_after=3600
      fi
      blocked_until=$(( $(date +%s) + retry_after ))
      printf '%s\n' "$blocked_until" >"$STATE_ROOT/${ACCOUNT}.blocked_until"
      log_meta "provider cooldown detected (2207051), retry_after=${retry_after}s"

      if [ -n "$CAPTION" ]; then
        confirm_delay="${IGCLI_CONFIRM_DELAY_S:-150}"
        if [[ "$confirm_delay" =~ ^[0-9]+$ ]] && [ "$confirm_delay" -gt 0 ]; then
          log_meta "running post-check after ${confirm_delay}s"
          sleep "$confirm_delay"
        fi

        if match_json="$(confirm_publish_by_caption "$ACCOUNT" "$CAPTION" 8)"; then
          log_meta "post-check found published media despite provider error"
          printf '{"ok":true,"action":"publish.recovered","data":{"recovered":true,"reason":"meta_block_but_post_found","match":%s}}\n' "$match_json" >"$TMP_OUT"
          : >"$TMP_ERR"
          STATUS=0
          printf '%s\n' "$(date +%s)" >"$STATE_ROOT/${ACCOUNT}.publish.last"
        else
          log_meta "post-check did not find matching caption"
        fi
      fi
    fi
  fi
fi

END_ISO="$(date -Is)"

{
  echo "[$START_ISO] CMD: $CMD_STR"
  if [ -s "$TMP_META" ]; then
    cat "$TMP_META"
  fi
  echo "[$END_ISO] EXIT: $STATUS"
  if [ -s "$TMP_OUT" ]; then
    echo "--- STDOUT ---"
    cat "$TMP_OUT"
  fi
  if [ -s "$TMP_ERR" ]; then
    echo "--- STDERR ---"
    cat "$TMP_ERR"
  fi
  echo "---"
} >>"$LOG_FILE"

cat "$TMP_OUT"
cat "$TMP_ERR" >&2

rm -f "$TMP_OUT" "$TMP_ERR" "$TMP_META"
exit $STATUS
