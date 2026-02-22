#!/usr/bin/env python3
"""
Content Engine - SQLite backend for content management
Handles posts, scheduling, queues, and migration from markdown
"""

import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DB_PATH = Path(__file__).parent / "content-engine.db"
MEMORY_DIR = Path(__file__).parent / "memory"


def init_db() -> None:
    """Initialize database with schema."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    
    # Create tables
    conn.executescript("""
    -- Posts table
    CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        content_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'draft',
        scheduled_at TEXT,
        published_at TEXT,
        cron_job_id TEXT,
        media_paths TEXT,
        caption TEXT,
        metrics TEXT,
        tags TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Content queue (ordered backlog)
    CREATE TABLE IF NOT EXISTS content_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT REFERENCES posts(id),
        position INTEGER,
        notes TEXT
    );

    -- Platform accounts
    CREATE TABLE IF NOT EXISTS accounts (
        platform TEXT PRIMARY KEY,
        handle TEXT,
        followers INTEGER,
        last_synced TEXT
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_queue_position ON content_queue(position);
    """)
    
    conn.commit()
    conn.close()


def _parse_date(date_str: str) -> Optional[str]:
    """Parse various date formats to ISO format."""
    if not date_str:
        return None
    
    # Handle formats like "11/02", "12/02", "13/02"
    if re.match(r'^\d{1,2}/\d{1,2}$', date_str):
        day, month = date_str.split('/')
        year = 2026  # Current year
        try:
            dt = datetime(year, int(month), int(day), 12, 0)  # Default to noon
            return dt.isoformat()
        except ValueError:
            return None
    
    # Handle "15/02 09h" or "15/02 21h"
    match = re.match(r'^(\d{1,2}/\d{1,2})\s+(\d{1,2})h', date_str)
    if match:
        date_part, hour = match.groups()
        day, month = date_part.split('/')
        year = 2026
        try:
            dt = datetime(year, int(month), int(day), int(hour), 0)
            return dt.isoformat()
        except ValueError:
            return None
    
    return None


def migrate_from_markdown() -> Dict[str, Any]:
    """Parse content calendar markdown files and import posts."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    
    stats = {"imported": 0, "skipped": 0, "errors": []}
    
    # Parse content-calendar.md
    content_calendar = MEMORY_DIR / "content-calendar.md"
    if content_calendar.exists():
        content = content_calendar.read_text(encoding='utf-8')
        
        # Parse published posts
        published_section = re.search(r'## ✅ Publicados.*?(?=## |$)', content, re.DOTALL)
        if published_section:
            lines = published_section.group(0).split('\n')
            for line in lines:
                if '|' in line and not line.startswith('|---') and 'Data' not in line:
                    try:
                        parts = [p.strip() for p in line.split('|')]
                        if len(parts) >= 4:
                            date_str = parts[1]
                            platform_str = parts[2]
                            content_str = parts[3]
                            status_str = parts[4] if len(parts) > 4 else ""
                            
                            # Parse platform
                            platform = "unknown"
                            content_type = "post"
                            
                            if "🔵 LinkedIn" in platform_str:
                                platform = "linkedin"
                                content_type = "post"
                            elif "🐦 Twitter" in platform_str:
                                platform = "twitter"
                                content_type = "thread" if "thread" in content_str.lower() else "tweet"
                            elif "📸 Instagram" in platform_str:
                                platform = "instagram"
                                if "Carrossel" in content_str:
                                    content_type = "carousel"
                                elif "Reel" in content_str:
                                    content_type = "reel"
                                else:
                                    content_type = "post"
                            elif "📰 Newsletter" in platform_str:
                                platform = "newsletter"
                                content_type = "newsletter"
                            
                            # Generate unique ID
                            post_id = str(uuid.uuid4())
                            
                            # Parse published date
                            published_at = _parse_date(date_str)
                            
                            # Extract metrics from status
                            metrics = {}
                            if "imp" in status_str:
                                match = re.search(r'([\d.]+k?)\s*imp', status_str)
                                if match:
                                    imp_str = match.group(1)
                                    imp_num = float(imp_str.replace('k', '')) * (1000 if 'k' in imp_str else 1)
                                    metrics['impressions'] = int(imp_num)
                            
                            if "reações" in status_str or "reação" in status_str:
                                match = re.search(r'(\d+)\s*reações?', status_str)
                                if match:
                                    metrics['reactions'] = int(match.group(1))
                            
                            conn.execute("""
                                INSERT OR IGNORE INTO posts 
                                (id, platform, content_type, title, status, published_at, metrics)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (
                                post_id,
                                platform,
                                content_type,
                                content_str.strip('"'),
                                "published",
                                published_at,
                                json.dumps(metrics) if metrics else None
                            ))
                            stats["imported"] += 1
                            
                    except Exception as e:
                        stats["errors"].append(f"Error parsing line: {line[:50]}... - {str(e)}")
        
        # Parse scheduled posts
        scheduled_section = re.search(r'## ⏳ Agendados.*?(?=## |$)', content, re.DOTALL)
        if scheduled_section:
            lines = scheduled_section.group(0).split('\n')
            for line in lines:
                if '|' in line and not line.startswith('|---') and 'Data' not in line:
                    try:
                        parts = [p.strip() for p in line.split('|')]
                        if len(parts) >= 5:
                            date_str = parts[1]
                            hour_str = parts[2]
                            platform_str = parts[3]
                            content_str = parts[4]
                            cron_id = parts[5] if len(parts) > 5 else ""
                            
                            # Parse platform and content type
                            platform = "unknown"
                            content_type = "post"
                            
                            if "📸" in platform_str:
                                platform = "instagram"
                                if "Reel" in content_str:
                                    content_type = "reel"
                                elif "Carrossel" in content_str:
                                    content_type = "carousel"
                                elif "Quote Card" in content_str:
                                    content_type = "quote_card"
                                elif "Infográfico" in content_str:
                                    content_type = "infographic"
                            elif "📰" in platform_str:
                                platform = "newsletter"
                                content_type = "newsletter"
                            
                            # Generate unique ID
                            post_id = str(uuid.uuid4())
                            
                            # Parse scheduled time
                            scheduled_datetime = f"{date_str} {hour_str}"
                            scheduled_at = _parse_date(scheduled_datetime)
                            
                            conn.execute("""
                                INSERT OR IGNORE INTO posts 
                                (id, platform, content_type, title, status, scheduled_at, cron_job_id)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (
                                post_id,
                                platform,
                                content_type,
                                content_str.strip(),
                                "scheduled",
                                scheduled_at,
                                cron_id.strip()
                            ))
                            stats["imported"] += 1
                            
                    except Exception as e:
                        stats["errors"].append(f"Error parsing scheduled line: {line[:50]}... - {str(e)}")
    
    # Parse queue items
    queue_section = re.search(r'## 📋 Fila \(sem data\).*?(?=## |$)', content, re.DOTALL)
    if queue_section:
        position = 1
        lines = queue_section.group(0).split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith('-') and line != '':
                try:
                    content_str = line.lstrip('- ').strip()
                    platform = "unknown"
                    content_type = "post"
                    
                    # Simple platform detection based on keywords
                    if "Instagram" in content_str or "Carrossel" in content_str or "Quote Card" in content_str:
                        platform = "instagram"
                        if "Carrossel" in content_str:
                            content_type = "carousel"
                        elif "Quote Card" in content_str:
                            content_type = "quote_card"
                    elif "Twitter" in content_str or "Thread" in content_str:
                        platform = "twitter"
                        content_type = "thread" if "Thread" in content_str else "tweet"
                    elif "LinkedIn" in content_str:
                        platform = "linkedin"
                        content_type = "post"
                    
                    # Create draft post
                    post_id = str(uuid.uuid4())
                    conn.execute("""
                        INSERT OR IGNORE INTO posts 
                        (id, platform, content_type, title, status)
                        VALUES (?, ?, ?, ?, ?)
                    """, (post_id, platform, content_type, content_str, "draft"))
                    
                    # Add to queue
                    conn.execute("""
                        INSERT INTO content_queue (post_id, position)
                        VALUES (?, ?)
                    """, (post_id, position))
                    
                    position += 1
                    stats["imported"] += 1
                    
                except Exception as e:
                    stats["errors"].append(f"Error parsing queue item: {line[:50]}... - {str(e)}")
    
    # Initialize account records
    accounts = [
        ("instagram", "@andrefprado", None),
        ("twitter", "@andrehfp", None),
        ("linkedin", "André Prado", None),
        ("newsletter", "TinySaaS", None),
    ]
    
    for platform, handle, followers in accounts:
        conn.execute("""
            INSERT OR IGNORE INTO accounts (platform, handle, followers, last_synced)
            VALUES (?, ?, ?, ?)
        """, (platform, handle, followers, datetime.now().isoformat()))
    
    conn.commit()
    conn.close()
    
    return stats


def add_post(platform: str, content_type: str, title: str, **kwargs) -> str:
    """Add a new post and return its ID."""
    post_id = str(uuid.uuid4())
    
    conn = sqlite3.connect(DB_PATH)
    
    # Build insert query dynamically
    fields = ["id", "platform", "content_type", "title"]
    values = [post_id, platform, content_type, title]
    
    allowed_fields = {
        "description", "status", "scheduled_at", "published_at", 
        "cron_job_id", "media_paths", "caption", "metrics", "tags"
    }
    
    for field, value in kwargs.items():
        if field in allowed_fields and value is not None:
            fields.append(field)
            if field in ("media_paths", "metrics", "tags"):
                values.append(json.dumps(value) if not isinstance(value, str) else value)
            else:
                values.append(value)
    
    fields.append("updated_at")
    values.append(datetime.now().isoformat())
    
    placeholders = ",".join(["?"] * len(fields))
    query = f"INSERT INTO posts ({','.join(fields)}) VALUES ({placeholders})"
    
    conn.execute(query, values)
    conn.commit()
    conn.close()
    
    return post_id


def update_post(post_id: str, **kwargs) -> bool:
    """Update a post by ID."""
    if not kwargs:
        return False
    
    conn = sqlite3.connect(DB_PATH)
    
    # Build update query
    set_clauses = []
    values = []
    
    allowed_fields = {
        "platform", "content_type", "title", "description", "status",
        "scheduled_at", "published_at", "cron_job_id", "media_paths",
        "caption", "metrics", "tags"
    }
    
    for field, value in kwargs.items():
        if field in allowed_fields:
            set_clauses.append(f"{field} = ?")
            if field in ("media_paths", "metrics", "tags"):
                values.append(json.dumps(value) if not isinstance(value, str) else value)
            else:
                values.append(value)
    
    if not set_clauses:
        conn.close()
        return False
    
    set_clauses.append("updated_at = ?")
    values.append(datetime.now().isoformat())
    values.append(post_id)
    
    query = f"UPDATE posts SET {','.join(set_clauses)} WHERE id = ?"
    
    cursor = conn.execute(query, values)
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return success


def get_posts(platform: str = None, status: str = None, from_date: str = None, to_date: str = None) -> List[Dict[str, Any]]:
    """Get posts with optional filters."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    where_clauses = []
    params = []
    
    if platform:
        where_clauses.append("platform = ?")
        params.append(platform)
    
    if status:
        where_clauses.append("status = ?")
        params.append(status)
    
    if from_date:
        where_clauses.append("(scheduled_at >= ? OR published_at >= ? OR created_at >= ?)")
        params.extend([from_date, from_date, from_date])
    
    if to_date:
        where_clauses.append("(scheduled_at <= ? OR published_at <= ? OR created_at <= ?)")
        params.extend([to_date, to_date, to_date])
    
    where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
    query = f"SELECT * FROM posts{where_sql} ORDER BY created_at DESC"
    
    rows = conn.execute(query, params).fetchall()
    conn.close()
    
    posts = []
    for row in rows:
        post = dict(row)
        # Parse JSON fields
        for field in ("media_paths", "metrics", "tags"):
            if post[field]:
                try:
                    post[field] = json.loads(post[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        posts.append(post)
    
    return posts


def get_scheduled() -> List[Dict[str, Any]]:
    """Get all future scheduled posts."""
    now = datetime.now().isoformat()
    return get_posts(status="scheduled")


def get_queue() -> List[Dict[str, Any]]:
    """Get ordered content queue."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    query = """
        SELECT q.id as queue_id, q.position, q.notes,
               p.id, p.platform, p.content_type, p.title, p.description, p.status,
               p.scheduled_at, p.published_at, p.created_at, p.updated_at
        FROM content_queue q
        JOIN posts p ON q.post_id = p.id
        ORDER BY q.position
    """
    
    rows = conn.execute(query).fetchall()
    conn.close()
    
    return [dict(row) for row in rows]


def get_stats(platform: str = None, days: int = 30) -> Dict[str, Any]:
    """Get aggregate metrics and stats."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # Date filter
    from datetime import timedelta
    from_date = (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) 
                - timedelta(days=days)).isoformat()
    
    where_clause = "WHERE (published_at >= ? OR created_at >= ?)"
    params = [from_date, from_date]
    
    if platform:
        where_clause += " AND platform = ?"
        params.append(platform)
    
    # Basic counts
    stats_query = f"""
        SELECT 
            COUNT(*) as total_posts,
            COUNT(CASE WHEN status = 'published' THEN 1 END) as published,
            COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled,
            COUNT(CASE WHEN status = 'draft' THEN 1 END) as drafts,
            platform
        FROM posts 
        {where_clause}
        GROUP BY platform
    """
    
    platform_stats = conn.execute(stats_query, params).fetchall()
    
    # Metrics aggregation
    metrics_query = f"""
        SELECT metrics, platform 
        FROM posts 
        {where_clause} AND metrics IS NOT NULL
    """
    
    metrics_rows = conn.execute(metrics_query, params).fetchall()
    
    # Process metrics
    total_impressions = 0
    total_reactions = 0
    total_likes = 0
    total_comments = 0
    total_shares = 0
    
    for row in metrics_rows:
        try:
            metrics = json.loads(row['metrics'])
            total_impressions += metrics.get('impressions', 0)
            total_reactions += metrics.get('reactions', 0)
            total_likes += metrics.get('likes', 0)
            total_comments += metrics.get('comments', 0)
            total_shares += metrics.get('shares', 0)
        except (json.JSONDecodeError, TypeError):
            continue
    
    conn.close()
    
    result = {
        "period_days": days,
        "from_date": from_date,
        "platform_stats": [dict(row) for row in platform_stats],
        "total_metrics": {
            "impressions": total_impressions,
            "reactions": total_reactions,
            "likes": total_likes,
            "comments": total_comments,
            "shares": total_shares
        }
    }
    
    if platform:
        result["platform"] = platform
    
    return result


def reorder_queue(post_id: str, new_position: int) -> bool:
    """Reorder a post in the content queue."""
    conn = sqlite3.connect(DB_PATH)
    
    # Get current position
    current_pos = conn.execute(
        "SELECT position FROM content_queue WHERE post_id = ?", 
        (post_id,)
    ).fetchone()
    
    if not current_pos:
        conn.close()
        return False
    
    current_position = current_pos[0]
    
    # Update positions
    if new_position > current_position:
        # Moving down: shift items up
        conn.execute("""
            UPDATE content_queue 
            SET position = position - 1 
            WHERE position > ? AND position <= ?
        """, (current_position, new_position))
    elif new_position < current_position:
        # Moving up: shift items down
        conn.execute("""
            UPDATE content_queue 
            SET position = position + 1 
            WHERE position >= ? AND position < ?
        """, (new_position, current_position))
    
    # Update the moved item
    conn.execute("""
        UPDATE content_queue 
        SET position = ? 
        WHERE post_id = ?
    """, (new_position, post_id))
    
    conn.commit()
    conn.close()
    return True


def get_accounts() -> List[Dict[str, Any]]:
    """Get platform accounts."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    rows = conn.execute("SELECT * FROM accounts ORDER BY platform").fetchall()
    conn.close()
    
    return [dict(row) for row in rows]


def update_account(platform: str, handle: str = None, followers: int = None) -> bool:
    """Update account information."""
    conn = sqlite3.connect(DB_PATH)
    
    updates = []
    params = []
    
    if handle is not None:
        updates.append("handle = ?")
        params.append(handle)
    
    if followers is not None:
        updates.append("followers = ?")
        params.append(followers)
    
    if not updates:
        conn.close()
        return False
    
    updates.append("last_synced = ?")
    params.append(datetime.now().isoformat())
    params.append(platform)
    
    query = f"UPDATE accounts SET {', '.join(updates)} WHERE platform = ?"
    
    cursor = conn.execute(query, params)
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return success


if __name__ == "__main__":
    # Test migration
    print("🗂️ Initializing Content Engine database...")
    init_db()
    
    print("📥 Migrating from markdown files...")
    result = migrate_from_markdown()
    
    print(f"✅ Migration complete!")
    print(f"   Imported: {result['imported']} posts")
    print(f"   Skipped: {result['skipped']} posts")
    
    if result['errors']:
        print(f"   Errors: {len(result['errors'])}")
        for error in result['errors'][:3]:  # Show first 3 errors
            print(f"     - {error}")
    
    # Show stats
    print(f"\n📊 Current stats:")
    stats = get_stats()
    print(f"   Total metrics: {stats['total_metrics']}")
    
    # Show queue
    queue = get_queue()
    print(f"\n📋 Queue: {len(queue)} items")
    for item in queue[:3]:
        print(f"   {item['position']}. {item['title'][:50]}...")
    
    # Show scheduled posts
    scheduled = get_scheduled()
    print(f"\n⏰ Scheduled: {len(scheduled)} posts")
    for post in scheduled[:3]:
        print(f"   {post['scheduled_at']} - {post['title'][:50]}...")