# Bootstrap on a new machine

## 1) Clone
```bash
git clone https://github.com/andrehfp/gavinclaw ~/.openclaw/workspace
cd ~/.openclaw/workspace
```

## 2) Restore runtime files
```bash
bash scripts/restore_to_workspace.sh ~/.openclaw/workspace
```

## 3) Manual required
- Add secrets in `~/.openclaw/.secrets/`
- Reconnect credentials/channels
- Validate:
```bash
openclaw status
openclaw cron list
```

## 4) Optional sync from current host back to repo
```bash
bash scripts/sync_from_workspace.sh ~/.openclaw/workspace
```
