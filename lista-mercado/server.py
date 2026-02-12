#!/usr/bin/env python3
"""
Servidor simples para a Lista de Mercado
- Serve o HTML
- API para sincronizar lista
- API para ofertas do dia
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os

PORT = 8765
BASE_DIR = os.path.dirname(__file__)
DATA_FILE = os.path.join(BASE_DIR, 'data.json')
OFERTAS_FILE = os.path.join(BASE_DIR, 'ofertas.json')

# Token de segurança para webhook externo (IFTTT/Alexa)
WEBHOOK_TOKEN = "8d17743ab43ffaf7b6e4c1837f2eb8e3"


def load_data():
    try:
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    except:
        return {'itens': []}


def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_ofertas():
    try:
        with open(OFERTAS_FILE, 'r') as f:
            return json.load(f)
    except:
        return {'data': None, 'ofertas': {}, 'links': {}}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/lista':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(load_data()).encode())
        elif self.path == '/api/ofertas':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(load_ofertas()).encode())
        elif self.path == '/ofertas':
            self.path = '/ofertas.html'
            super().do_GET()
        elif self.path.startswith('/api/adicionar'):
            # GET /api/adicionar?item=leite&token=XXX (para IFTTT/webhooks)
            from urllib.parse import urlparse, parse_qs
            query = parse_qs(urlparse(self.path).query)
            item = query.get('item', [''])[0]
            token = query.get('token', [''])[0]
            
            # Verifica token
            if token != WEBHOOK_TOKEN:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b'{"error": "invalid token"}')
                return
            
            if item:
                data = load_data()
                data['itens'].insert(0, {
                    'text': item,
                    'checked': False,
                    'addedAt': int(__import__('time').time() * 1000),
                    'source': 'alexa'
                })
                save_data(data)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'item': item}).encode())
            else:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "item required"}')
        else:
            super().do_GET()
    
    def do_POST(self):
        if self.path == '/api/lista':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode())
            save_data(data)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode())
        else:
            self.send_error(404)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Cria arquivo de dados se não existe
    if not os.path.exists(DATA_FILE):
        save_data({'itens': []})
    
    print(f'Servidor rodando em http://localhost:{PORT}')
    HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
