#!/usr/bin/env python3
import argparse
import json
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path

DB = Path('/home/andreprado/.openclaw/workspace/content-engine.db')
WORKSPACE = Path('/home/andreprado/.openclaw/workspace')
ACCOUNT = 'andrefprado'
CONFIRM = '@andrefprado'


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\nSTDOUT:\n{p.stdout}\nSTDERR:\n{p.stderr}")
    return p.stdout.strip()


def as_abs(path_str: str) -> str:
    p = Path(path_str)
    if not p.is_absolute():
        p = WORKSPACE / p
    return str(p)


def upload_file(local_path: str) -> str:
    out = run([
        'instacli', 'upload', 'file',
        '--account', ACCOUNT,
        '--file', local_path,
        '--via', 'auto',
        '--json', '--quiet'
    ])
    data = json.loads(out)
    # tolerate variations
    url = ''
    if isinstance(data, dict):
        url = (data.get('data') or {}).get('url') or data.get('url') or ''
    if not url:
        raise RuntimeError(f'Upload returned no URL: {out}')
    return url


def publish_photo(url: str, caption: str):
    run([
        'instacli', 'publish', 'photo',
        '--account', ACCOUNT,
        '--file', url,
        '--caption', caption,
        '--confirm-account', CONFIRM,
        '--json', '--quiet'
    ])


def publish_carousel(urls, caption: str):
    cmd = [
        'instacli', 'publish', 'carousel',
        '--account', ACCOUNT,
        '--caption', caption,
        '--confirm-account', CONFIRM,
        '--json', '--quiet',
        '--files', *urls,
    ]
    run(cmd)


def next_post(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT q.id as queue_id, q.position, p.id, p.title, p.content_type, p.caption, p.media_paths
        FROM content_queue q
        JOIN posts p ON p.id = q.post_id
        WHERE p.title LIKE '[OpenClaw]%' AND p.media_paths IS NOT NULL AND p.status IN ('draft','ready','scheduled')
        ORDER BY q.position ASC
        LIMIT 1
    """)
    return cur.fetchone()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    row = next_post(conn)
    if not row:
        print('NO_PENDING_PERSONAL_POST')
        return

    queue_id, position, post_id, title, content_type, caption, media_paths = row
    caption = caption or title
    media = json.loads(media_paths)

    if args.dry_run:
        print(f'DRY_RUN next: pos={position} title={title} type={content_type} media={len(media)}')
        return

    uploaded_urls = [upload_file(as_abs(m)) for m in media]

    if content_type in ('carousel',):
        publish_carousel(uploaded_urls, caption)
    else:
        # post / quote_card / infographic => single photo
        publish_photo(uploaded_urls[0], caption)

    now = datetime.now().isoformat()
    cur = conn.cursor()
    cur.execute('UPDATE posts SET status=?, published_at=?, updated_at=? WHERE id=?', ('published', now, now, post_id))
    cur.execute('DELETE FROM content_queue WHERE id=?', (queue_id,))
    conn.commit()
    print(f'PUBLISHED pos={position} title={title} type={content_type}')


if __name__ == '__main__':
    main()
