#!/usr/bin/env python3
import psycopg2
import os

# Database connection
db_url = "postgresql://readonly_user:redhouseoveryonder@ep-divine-wildflower-acwxe8n5-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    print("Connected to database successfully!")
    
    # List tables
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)
    
    tables = cur.fetchall()
    print("\nAvailable tables:")
    for table in tables:
        print(f"  - {table[0]}")
        
    # For each table, show columns
    for table in tables:
        table_name = table[0]
        print(f"\n{table_name} columns:")
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = %s 
            ORDER BY ordinal_position;
        """, (table_name,))
        
        columns = cur.fetchall()
        for column, data_type in columns:
            print(f"  - {column} ({data_type})")
            
        # Show row count
        cur.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cur.fetchone()[0]
        print(f"  Row count: {count}")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"Database error: {e}")