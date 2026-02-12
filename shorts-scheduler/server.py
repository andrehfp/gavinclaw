#!/usr/bin/env python3
"""
Shorts Scheduler - Agendador de publicação de Shorts
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
from datetime import datetime
from pathlib import Path

PORT = 8766
BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / 'schedule.json'
SHORTS_DIR = Path.home() / '.openclaw' / 'workspace' / 'shorts_output'


def load_schedule():
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return {'shorts': [], 'settings': {'default_time': '10:00', 'interval_hours': 24}}


def save_schedule(data):
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def get_pending_shorts():
    """Lista shorts disponíveis para agendar"""
    shorts = []
    if SHORTS_DIR.exists():
        for f in SHORTS_DIR.glob('*.mp4'):
            if 'final' in f.name or f.name.startswith('short_'):
                shorts.append({
                    'filename': f.name,
                    'path': str(f),
                    'size_mb': round(f.stat().st_size / 1024 / 1024, 1)
                })
    return shorts


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def do_GET(self):
        if self.path == '/api/schedule':
            self.send_json(load_schedule())
        elif self.path == '/api/shorts':
            self.send_json(get_pending_shorts())
        elif self.path == '/':
            self.path = '/index.html'
            super().do_GET()
        else:
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = json.loads(self.rfile.read(content_length).decode())
        
        if self.path == '/api/schedule':
            save_schedule(post_data)
            self.send_json({'ok': True})
        elif self.path == '/api/add':
            schedule = load_schedule()
            schedule['shorts'].append(post_data)
            save_schedule(schedule)
            self.send_json({'ok': True})
        elif self.path == '/api/remove':
            schedule = load_schedule()
            schedule['shorts'] = [s for s in schedule['shorts'] if s['id'] != post_data['id']]
            save_schedule(schedule)
            self.send_json({'ok': True})
        elif self.path == '/api/update':
            schedule = load_schedule()
            for i, s in enumerate(schedule['shorts']):
                if s['id'] == post_data['id']:
                    schedule['shorts'][i] = post_data
                    break
            save_schedule(schedule)
            self.send_json({'ok': True})
        else:
            self.send_json({'error': 'Not found'}, 404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


if __name__ == '__main__':
    os.chdir(BASE_DIR)
    
    # Cria schedule inicial se não existe
    if not DATA_FILE.exists():
        save_schedule({'shorts': [], 'settings': {'default_time': '10:00', 'interval_hours': 24}})
    
    print(f'Shorts Scheduler rodando em http://localhost:{PORT}')
    HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
