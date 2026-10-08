#!/usr/bin/env python3
"""Локальный сервер без кеша: python3 tools/serve.py [порт=4180]. Модули ES и JSON всегда свежие."""
import sys, http.server, functools, os
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4180
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer.allow_reuse_address = True
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(H, directory=ROOT)).serve_forever()
