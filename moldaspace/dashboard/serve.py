#!/usr/bin/env python3
"""MoldaSpace Mission Control Dashboard — lightweight HTTP server."""
import http.server
import json
import os
import socketserver

PORT = 8768
DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DIR, "data.json")
LOG_FILE = os.path.join(os.path.dirname(DIR), "memory", "reddit-log.md")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIR, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        if self.path == "/data.json":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE) as f:
                    self.wfile.write(f.read().encode())
            else:
                self.wfile.write(b'{}')
            return
        if self.path == "/reddit-log.txt":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            if os.path.exists(LOG_FILE):
                with open(LOG_FILE) as f:
                    self.wfile.write(f.read().encode())
            else:
                self.wfile.write(b"No activity yet.")
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass  # silent

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"MoldaSpace Mission Control → http://localhost:{PORT}")
    httpd.serve_forever()
