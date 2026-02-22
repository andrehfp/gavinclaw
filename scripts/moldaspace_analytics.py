#!/home/andreprado/.openclaw/workspace/scripts/moldaspace_env/bin/python3
"""
MoldaSpace Analytics Script
Pulls metrics from PostHog, Google Search Console, and Neon DB
"""

import os
import sys
import json
import argparse
import requests
import psycopg2
from datetime import datetime, timedelta
from typing import Dict, Any
from google.oauth2 import service_account
from googleapiclient.discovery import build


def load_secret(filename: str) -> str:
    """Load a secret from ~/.openclaw/.secrets/"""
    secret_path = os.path.expanduser(f"~/.openclaw/.secrets/{filename}")
    try:
        with open(secret_path, 'r') as f:
            return f.read().strip()
    except FileNotFoundError:
        raise FileNotFoundError(f"Secret file not found: {secret_path}")


def load_env_file(filename: str) -> Dict[str, str]:
    """Load environment variables from a .env file"""
    env_path = os.path.expanduser(f"~/.openclaw/.secrets/{filename}")
    env_vars = {}
    try:
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip().strip('"\'')
        return env_vars
    except FileNotFoundError:
        raise FileNotFoundError(f"Environment file not found: {env_path}")


def get_posthog_data(days: int) -> Dict[str, Any]:
    """Pull data from PostHog"""
    try:
        api_key = load_secret("moldaspace_posthog_key")
        base_url = "https://us.posthog.com/api/projects/257719/query/"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        results = {}
        
        # Pageviews last 24h
        pageviews_24h_query = {
            "query": {
                "kind": "EventsQuery",
                "select": ["count()"],
                "event": "$pageview",
                "after": (datetime.now() - timedelta(days=1)).isoformat(),
                "before": datetime.now().isoformat()
            }
        }
        
        response = requests.post(base_url, headers=headers, json=pageviews_24h_query)
        if response.status_code == 200:
            data = response.json()
            results['pageviews_24h'] = data.get('results', [[0]])[0][0] if data.get('results') else 0
        else:
            results['pageviews_24h'] = f'Error: {response.status_code} - {response.text[:100]}'
        
        # Pageviews last N days
        pageviews_nd_query = {
            "query": {
                "kind": "EventsQuery",
                "select": ["count()"],
                "event": "$pageview",
                "after": (datetime.now() - timedelta(days=days)).isoformat(),
                "before": datetime.now().isoformat()
            }
        }
        
        response = requests.post(base_url, headers=headers, json=pageviews_nd_query)
        if response.status_code == 200:
            data = response.json()
            results[f'pageviews_{days}d'] = data.get('results', [[0]])[0][0] if data.get('results') else 0
        else:
            results[f'pageviews_{days}d'] = f'Error: {response.status_code} - {response.text[:100]}'
        
        # Unique visitors
        unique_visitors_query = {
            "query": {
                "kind": "EventsQuery",
                "select": ["count(DISTINCT person_id)"],
                "event": "$pageview",
                "after": (datetime.now() - timedelta(days=days)).isoformat(),
                "before": datetime.now().isoformat()
            }
        }
        
        response = requests.post(base_url, headers=headers, json=unique_visitors_query)
        if response.status_code == 200:
            data = response.json()
            results[f'unique_visitors_{days}d'] = data.get('results', [[0]])[0][0] if data.get('results') else 0
        else:
            results[f'unique_visitors_{days}d'] = f'Error: {response.status_code} - {response.text[:100]}'
        
        # Top pages
        top_pages_query = {
            "query": {
                "kind": "EventsQuery",
                "select": ["properties.$current_url", "count()"],
                "event": "$pageview",
                "after": (datetime.now() - timedelta(days=days)).isoformat(),
                "before": datetime.now().isoformat(),
                "orderBy": ["count() DESC"],
                "limit": 10
            }
        }
        
        response = requests.post(base_url, headers=headers, json=top_pages_query)
        if response.status_code == 200:
            data = response.json()
            results['top_pages'] = data.get('results', [])
        else:
            results['top_pages'] = []
        
        # Signups
        signups_query = {
            "query": {
                "kind": "EventsQuery",
                "select": ["count()"],
                "event": "user_signed_up",
                "after": (datetime.now() - timedelta(days=days)).isoformat(),
                "before": datetime.now().isoformat()
            }
        }
        
        response = requests.post(base_url, headers=headers, json=signups_query)
        if response.status_code == 200:
            data = response.json()
            results[f'signups_{days}d'] = data.get('results', [[0]])[0][0] if data.get('results') else 0
        else:
            results[f'signups_{days}d'] = f'Error: {response.status_code} - {response.text[:100]}'
        
        return results
    
    except Exception as e:
        return {'error': f"PostHog error: {str(e)}"}


def get_gsc_data(days: int) -> Dict[str, Any]:
    """Pull data from Google Search Console"""
    try:
        # Load service account credentials
        service_account_path = os.path.expanduser("~/.openclaw/.secrets/moldaspace_gsc_service_account.json")
        credentials = service_account.Credentials.from_service_account_file(
            service_account_path, 
            scopes=['https://www.googleapis.com/auth/webmasters.readonly']
        )
        
        service = build('webmasters', 'v3', credentials=credentials)
        
        # Try both site formats
        sites_to_try = ['sc-domain:moldaspace.com', 'https://moldaspace.com/']
        
        for site_url in sites_to_try:
            try:
                # Get search analytics data
                end_date = datetime.now().date()
                start_date = end_date - timedelta(days=days)
                
                request_body = {
                    'startDate': start_date.isoformat(),
                    'endDate': end_date.isoformat(),
                    'dimensions': ['query'],
                    'rowLimit': 10
                }
                
                response = service.searchanalytics().query(
                    siteUrl=site_url, body=request_body).execute()
                
                rows = response.get('rows', [])
                
                # Calculate totals
                total_clicks = sum(row.get('clicks', 0) for row in rows)
                total_impressions = sum(row.get('impressions', 0) for row in rows)
                avg_ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
                
                # Get top queries
                top_queries = [(row['keys'][0], row.get('clicks', 0), row.get('impressions', 0)) 
                              for row in rows[:10]]
                
                return {
                    'site_url': site_url,
                    'total_clicks': total_clicks,
                    'total_impressions': total_impressions,
                    'avg_ctr': round(avg_ctr, 2),
                    'top_queries': top_queries
                }
                
            except Exception as e:
                continue  # Try next site format
        
        return {'error': 'Unable to access GSC data with either site format'}
        
    except Exception as e:
        return {'error': f"GSC error: {str(e)}"}


def get_instagram_data() -> Dict[str, Any]:
    """Pull data from Instagram Graph API for @studio.maia.arch"""
    try:
        creds_path = os.path.expanduser("~/.openclaw/.secrets/instagram_maia_api.json")
        with open(creds_path, 'r') as f:
            creds = json.load(f)
        
        ig_id = creds['ig_account_id']
        token = creds['page_access_token']
        
        # Account info
        r = requests.get(f'https://graph.facebook.com/v21.0/{ig_id}',
            params={'fields': 'followers_count,media_count,username', 'access_token': token})
        account = r.json()
        
        results = {
            'followers': account.get('followers_count', 0),
            'media_count': account.get('media_count', 0),
            'username': account.get('username', 'studio.maia.arch'),
        }
        
        # Recent media (last 10 posts)
        r2 = requests.get(f'https://graph.facebook.com/v21.0/{ig_id}/media',
            params={
                'fields': 'id,like_count,comments_count,timestamp,media_type',
                'access_token': token,
                'limit': 10
            })
        media = r2.json().get('data', [])
        
        total_likes = sum(p.get('like_count', 0) for p in media)
        total_comments = sum(p.get('comments_count', 0) for p in media)
        results['recent_posts'] = len(media)
        results['total_likes_recent'] = total_likes
        results['total_comments_recent'] = total_comments
        results['avg_engagement'] = round((total_likes + total_comments) / max(len(media), 1), 1)
        
        # Last post details
        if media:
            last = media[0]
            results['last_post_date'] = last.get('timestamp', '')
            results['last_post_likes'] = last.get('like_count', 0)
            results['last_post_comments'] = last.get('comments_count', 0)
            results['last_post_type'] = last.get('media_type', '')
        
        return results
    except Exception as e:
        return {'error': f"Instagram error: {str(e)}"}


def get_neon_data(days: int) -> Dict[str, Any]:
    """Pull data from Neon DB"""
    try:
        # Load database connection string
        env_vars = load_env_file("moldaspace_db.env")
        
        # Check for complete DATABASE_URL first
        db_url = None
        for key in ['DATABASE_URL', 'NEON_DATABASE_URL', 'DB_URL']:
            if key in env_vars:
                db_url = env_vars[key]
                break
        
        # If no complete URL, try to build from individual components
        if not db_url:
            if all(key in env_vars for key in ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']):
                db_url = f"postgresql://{env_vars['PGUSER']}:{env_vars['PGPASSWORD']}@{env_vars['PGHOST']}/{env_vars['PGDATABASE']}"
                if 'PGSSLMODE' in env_vars:
                    db_url += f"?sslmode={env_vars['PGSSLMODE']}"
            else:
                return {'error': 'Database connection details not found in moldaspace_db.env'}
        
        # Connect to database
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        results = {}
        
        # Total users
        try:
            cur.execute("SELECT COUNT(*) FROM user_credits")
            results['total_users'] = cur.fetchone()[0]
        except Exception as e:
            results['total_users'] = f'Error: {str(e)}'
        
        # New users (last 24h) - based on signup_date
        try:
            cur.execute("""
                SELECT COUNT(*) FROM user_credits 
                WHERE signup_date >= NOW() - INTERVAL '24 hours'
            """)
            results['new_users_24h'] = cur.fetchone()[0]
        except Exception as e:
            results['new_users_24h'] = f'Error: {str(e)}'
        
        # Total credit purchases (positive amounts in credit_transactions)
        try:
            cur.execute("""
                SELECT COUNT(*) FROM credit_transactions 
                WHERE amount > 0 AND type = 'purchase'
            """)
            results['total_purchases'] = cur.fetchone()[0]
        except Exception as e:
            # Try without type filter
            try:
                cur.execute("SELECT COUNT(*) FROM credit_transactions WHERE amount > 0")
                results['total_purchases'] = cur.fetchone()[0]
            except Exception as e2:
                results['total_purchases'] = f'Error: {str(e2)}'
        
        # Revenue calculation using actual Stripe pricing
        # Starter pack: 10 credits = ~$4.70, Standard pack: 40 credits = ~$18.80
        # Price per credit: $0.47
        PRICE_PER_CREDIT = 0.47
        
        # Revenue last 24h
        try:
            cur.execute("""
                SELECT COALESCE(SUM(amount), 0) FROM credit_transactions 
                WHERE type='purchase' AND created_at >= NOW() - INTERVAL '24 hours'
            """)
            credits_24h = cur.fetchone()[0]
            results['revenue_24h'] = float(credits_24h) * PRICE_PER_CREDIT
            results['purchases_24h_credits'] = int(credits_24h)
        except Exception as e:
            results['revenue_24h'] = f'Error: {str(e)}'
        
        # Revenue last 30 days (MRR proxy)
        try:
            cur.execute("""
                SELECT COALESCE(SUM(amount), 0) FROM credit_transactions 
                WHERE type='purchase' AND created_at >= NOW() - INTERVAL '30 days'
            """)
            credits_30d = cur.fetchone()[0]
            results['mrr_estimate'] = float(credits_30d) * PRICE_PER_CREDIT
        except Exception as e:
            results['mrr_estimate'] = f'Error: {str(e)}'
        
        # Revenue last N days
        try:
            cur.execute(f"""
                SELECT COALESCE(SUM(amount), 0), COUNT(*) FROM credit_transactions 
                WHERE type='purchase' AND created_at >= NOW() - INTERVAL '{days} days'
            """)
            row = cur.fetchone()
            results[f'revenue_{days}d'] = float(row[0]) * PRICE_PER_CREDIT
            results[f'purchases_{days}d'] = int(row[1])
        except Exception as e:
            results[f'revenue_{days}d'] = f'Error: {str(e)}'
        
        # Yesterday's revenue and purchases
        try:
            cur.execute("""
                SELECT COALESCE(SUM(amount), 0), COUNT(*) FROM credit_transactions 
                WHERE type='purchase' 
                AND created_at >= (CURRENT_DATE - INTERVAL '1 day')
                AND created_at < CURRENT_DATE
            """)
            row = cur.fetchone()
            results['revenue_yesterday'] = float(row[0]) * PRICE_PER_CREDIT
            results['purchases_yesterday'] = int(row[1])
        except Exception as e:
            results['revenue_yesterday'] = f'Error: {str(e)}'
            results['purchases_yesterday'] = f'Error: {str(e)}'
        
        # Yesterday's new signups
        try:
            cur.execute("""
                SELECT COUNT(*) FROM user_credits 
                WHERE signup_date >= (CURRENT_DATE - INTERVAL '1 day')
                AND signup_date < CURRENT_DATE
            """)
            results['signups_yesterday'] = cur.fetchone()[0]
        except Exception as e:
            results['signups_yesterday'] = f'Error: {str(e)}'
        
        # Active users (used credits in last 7 days)
        try:
            cur.execute("""
                SELECT COUNT(DISTINCT user_id) FROM credit_transactions 
                WHERE created_at >= NOW() - INTERVAL '7 days'
            """)
            results['active_users_7d'] = cur.fetchone()[0]
        except Exception as e:
            results['active_users_7d'] = f'Error: {str(e)}'
        
        # Signups last N days (from user_credits.signup_date)
        try:
            cur.execute(f"""
                SELECT COUNT(*) FROM user_credits 
                WHERE signup_date >= NOW() - INTERVAL '{days} days'
            """)
            results[f'signups_{days}d'] = cur.fetchone()[0]
        except Exception as e:
            results[f'signups_{days}d'] = f'Error: {str(e)}'

        # Referral leads (table: referrals)
        try:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'referrals'
            """)
            referral_cols = {row[0] for row in cur.fetchall()}

            ts_col = None
            for candidate in ['created_at', 'createdAt', 'inserted_at', 'updated_at']:
                if candidate in referral_cols:
                    ts_col = candidate
                    break

            cur.execute("SELECT COUNT(*) FROM referrals")
            results['referrals_total'] = cur.fetchone()[0]

            if ts_col:
                cur.execute(f"""
                    SELECT COUNT(*) FROM referrals
                    WHERE {ts_col} >= NOW() - INTERVAL '24 hours'
                """)
                results['referrals_24h'] = cur.fetchone()[0]

                cur.execute(f"""
                    SELECT COUNT(*) FROM referrals
                    WHERE {ts_col} >= NOW() - INTERVAL '{days} days'
                """)
                results[f'referrals_{days}d'] = cur.fetchone()[0]

                cur.execute(f"""
                    SELECT COUNT(*) FROM referrals
                    WHERE {ts_col} >= (CURRENT_DATE - INTERVAL '1 day')
                      AND {ts_col} < CURRENT_DATE
                """)
                results['referrals_yesterday'] = cur.fetchone()[0]
            else:
                results['referrals_24h'] = 'N/A (no timestamp column found on referrals)'
                results[f'referrals_{days}d'] = 'N/A (no timestamp column found on referrals)'
                results['referrals_yesterday'] = 'N/A (no timestamp column found on referrals)'

        except Exception as e:
            results['referrals_total'] = f'Error: {str(e)}'
            results['referrals_24h'] = f'Error: {str(e)}'
            results[f'referrals_{days}d'] = f'Error: {str(e)}'
            results['referrals_yesterday'] = f'Error: {str(e)}'
        
        cur.close()
        conn.close()
        
        return results
        
    except Exception as e:
        return {'error': f"Database error: {str(e)}"}


def main():
    parser = argparse.ArgumentParser(description='MoldaSpace Analytics')
    parser.add_argument('--json', action='store_true', help='Output JSON format')
    parser.add_argument('--days', type=int, default=7, help='Number of days to analyze (default: 7)')
    
    args = parser.parse_args()
    
    # Collect data from all sources
    print("Collecting MoldaSpace analytics...", file=sys.stderr)
    
    posthog_data = get_posthog_data(args.days)
    gsc_data = get_gsc_data(args.days)
    neon_data = get_neon_data(args.days)
    instagram_data = get_instagram_data()
    
    # Combine all data
    analytics_data = {
        'timestamp': datetime.now().isoformat(),
        'days_analyzed': args.days,
        'posthog': posthog_data,
        'google_search_console': gsc_data,
        'database': neon_data,
        'instagram': instagram_data
    }
    
    if args.json:
        print(json.dumps(analytics_data, indent=2))
    else:
        # Print clean summary
        print(f"\n📊 MoldaSpace Analytics - Last {args.days} Days")
        print("=" * 50)
        
        # PostHog metrics
        print("\n🔍 PostHog Metrics:")
        if 'error' not in posthog_data:
            pv_24h = posthog_data.get('pageviews_24h', 'N/A')
            pv_nd = posthog_data.get(f'pageviews_{args.days}d', 'N/A')
            uv_nd = posthog_data.get(f'unique_visitors_{args.days}d', 'N/A')
            signups_nd = posthog_data.get(f'signups_{args.days}d', 'N/A')
            
            print(f"  • Pageviews (24h): {pv_24h:,}" if isinstance(pv_24h, (int, float)) else f"  • Pageviews (24h): {pv_24h}")
            print(f"  • Pageviews ({args.days}d): {pv_nd:,}" if isinstance(pv_nd, (int, float)) else f"  • Pageviews ({args.days}d): {pv_nd}")
            print(f"  • Unique visitors ({args.days}d): {uv_nd:,}" if isinstance(uv_nd, (int, float)) else f"  • Unique visitors ({args.days}d): {uv_nd}")
            print(f"  • Signups ({args.days}d): {signups_nd:,}" if isinstance(signups_nd, (int, float)) else f"  • Signups ({args.days}d): {signups_nd}")
            
            if posthog_data.get('top_pages'):
                print("  • Top Pages:")
                for i, page_data in enumerate(posthog_data['top_pages'][:5], 1):
                    if len(page_data) >= 2:
                        print(f"    {i}. {page_data[0]} ({page_data[1]:,} views)")
        else:
            print(f"  ❌ {posthog_data['error']}")
        
        # Google Search Console metrics
        print("\n🔎 Google Search Console:")
        if 'error' not in gsc_data:
            clicks = gsc_data.get('total_clicks', 'N/A')
            impressions = gsc_data.get('total_impressions', 'N/A')
            ctr = gsc_data.get('avg_ctr', 'N/A')
            
            print(f"  • Total clicks: {clicks:,}" if isinstance(clicks, (int, float)) else f"  • Total clicks: {clicks}")
            print(f"  • Total impressions: {impressions:,}" if isinstance(impressions, (int, float)) else f"  • Total impressions: {impressions}")
            print(f"  • Average CTR: {ctr}%" if ctr != 'N/A' else "  • Average CTR: N/A")
            
            if gsc_data.get('top_queries'):
                print("  • Top Queries:")
                for i, (query, clicks, impressions) in enumerate(gsc_data['top_queries'][:5], 1):
                    ctr = (clicks / impressions * 100) if impressions > 0 else 0
                    print(f"    {i}. {query} ({clicks:,} clicks, {ctr:.1f}% CTR)")
        else:
            print(f"  ❌ {gsc_data['error']}")
        
        # Database metrics
        print("\n💾 Database Metrics:")
        if 'error' not in neon_data:
            total_users = neon_data.get('total_users', 'N/A')
            new_users_24h = neon_data.get('new_users_24h', 'N/A')
            total_purchases = neon_data.get('total_purchases', 'N/A')
            active_7d = neon_data.get('active_users_7d', 'N/A')
            signups_nd = neon_data.get(f'signups_{args.days}d', 'N/A')
            
            print(f"  • Total users: {total_users:,}" if isinstance(total_users, (int, float)) else f"  • Total users: {total_users}")
            print(f"  • New signups (24h): {new_users_24h:,}" if isinstance(new_users_24h, (int, float)) else f"  • New signups (24h): {new_users_24h}")
            print(f"  • Signups ({args.days}d): {signups_nd:,}" if isinstance(signups_nd, (int, float)) else f"  • Signups ({args.days}d): {signups_nd}")
            print(f"  • Active users (7d): {active_7d:,}" if isinstance(active_7d, (int, float)) else f"  • Active users (7d): {active_7d}")
            print(f"  • Total purchases (all-time): {total_purchases:,}" if isinstance(total_purchases, (int, float)) else f"  • Total purchases: {total_purchases}")

            referrals_total = neon_data.get('referrals_total', 'N/A')
            referrals_24h = neon_data.get('referrals_24h', 'N/A')
            referrals_nd = neon_data.get(f'referrals_{args.days}d', 'N/A')
            print(f"  • Referral leads (total): {referrals_total:,}" if isinstance(referrals_total, (int, float)) else f"  • Referral leads (total): {referrals_total}")
            print(f"  • Referral leads (24h): {referrals_24h:,}" if isinstance(referrals_24h, (int, float)) else f"  • Referral leads (24h): {referrals_24h}")
            print(f"  • Referral leads ({args.days}d): {referrals_nd:,}" if isinstance(referrals_nd, (int, float)) else f"  • Referral leads ({args.days}d): {referrals_nd}")
            
            revenue_24h = neon_data.get('revenue_24h', 'N/A')
            if isinstance(revenue_24h, (int, float)):
                print(f"  • Revenue (24h): ${revenue_24h:,.2f}")
            else:
                print(f"  • Revenue (24h): {revenue_24h}")
            
            revenue_nd = neon_data.get(f'revenue_{args.days}d', 'N/A')
            purchases_nd = neon_data.get(f'purchases_{args.days}d', 'N/A')
            if isinstance(revenue_nd, (int, float)):
                print(f"  • Revenue ({args.days}d): ${revenue_nd:,.2f} ({purchases_nd} purchases)")
            
            mrr = neon_data.get('mrr_estimate', 'N/A')
            if isinstance(mrr, (int, float)):
                print(f"  • MRR (30d revenue): ${mrr:,.2f}")
            else:
                print(f"  • MRR (30d revenue): {mrr}")
        else:
            print(f"  ❌ {neon_data['error']}")
        
        # Instagram metrics
        print("\n📱 Instagram @studio.maia.arch:")
        if 'error' not in instagram_data:
            print(f"  • Followers: {instagram_data.get('followers', 'N/A')}")
            print(f"  • Posts: {instagram_data.get('media_count', 'N/A')}")
            print(f"  • Avg engagement (last {instagram_data.get('recent_posts', 0)} posts): {instagram_data.get('avg_engagement', 'N/A')}")
            print(f"  • Total likes (recent): {instagram_data.get('total_likes_recent', 'N/A')}")
            print(f"  • Total comments (recent): {instagram_data.get('total_comments_recent', 'N/A')}")
            if instagram_data.get('last_post_date'):
                print(f"  • Last post: {instagram_data['last_post_date'][:10]} ({instagram_data.get('last_post_type', '')})")
                print(f"    Likes: {instagram_data.get('last_post_likes', 0)} | Comments: {instagram_data.get('last_post_comments', 0)}")
        else:
            print(f"  ❌ {instagram_data['error']}")
        
        # Yesterday snapshot
        if 'error' not in neon_data:
            rev_y = neon_data.get('revenue_yesterday', 'N/A')
            pur_y = neon_data.get('purchases_yesterday', 'N/A')
            sig_y = neon_data.get('signups_yesterday', 'N/A')
            ref_y = neon_data.get('referrals_yesterday', 'N/A')
            print(f"\n📅 Yesterday:")
            if isinstance(rev_y, (int, float)):
                print(f"  • Revenue: ${rev_y:,.2f} ({pur_y} purchases)")
            print(f"  • Signups: {sig_y}")
            print(f"  • Referral leads: {ref_y}")
        
        print(f"\n⏰ Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()