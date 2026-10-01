#!/usr/bin/env python3
"""Local editor for the selected-works portfolio page.

Run from anywhere:  python3 tools/portfolio-editor/server.py
Then open http://localhost:4001 (it opens automatically).

It edits _data/selected_works.json. If `jekyll serve` is running,
the page at http://localhost:4000/selected-works/ updates on save.
"""

import hashlib
import json
import os
import re
import shutil
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT", 4001))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA_FILE = os.path.join(ROOT, "_data", "selected_works.json")
BACKUP_FILE = DATA_FILE + ".bak"
UPLOAD_DIR = os.path.join(ROOT, "assets", "images", "selected-works")
UPLOAD_URL = "/assets/images/selected-works/"
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
MAX_UPLOAD = 25 * 1024 * 1024


def file_version():
    with open(DATA_FILE, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, status, body, content_type="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit):
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise ValueError("file too large")
        return self.rfile.read(length)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            with open(os.path.join(HERE, "editor.html"), "rb") as f:
                self.send(200, f.read(), "text/html")
        elif path == "/api/data":
            with open(DATA_FILE, "rb") as f:
                raw = f.read()
            self.send(200, {"version": file_version(), "data": json.loads(raw)})
        elif path.startswith("/assets/"):
            # serve site images so the editor can preview them
            full = os.path.abspath(os.path.join(ROOT, path.lstrip("/")))
            if full.startswith(os.path.join(ROOT, "assets")) and os.path.isfile(full):
                ext = os.path.splitext(full)[1].lower().lstrip(".")
                ctype = {"jpg": "image/jpeg", "svg": "image/svg+xml"}.get(ext, "image/" + ext)
                with open(full, "rb") as f:
                    self.send(200, f.read(), ctype)
            else:
                self.send(404, {"error": "not found"})
        else:
            self.send(404, {"error": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        try:
            if url.path == "/api/data":
                body = json.loads(self.read_body(5 * 1024 * 1024))
                data = body.get("data") if isinstance(body, dict) else None
                if not isinstance(data, dict) or not isinstance(data.get("sections"), list):
                    raise ValueError("invalid data")
                # refuse to overwrite changes made to the file since the editor loaded it
                if body.get("version") != file_version() and not body.get("force"):
                    self.send(409, {"error": "conflict"})
                    return
                if os.path.exists(DATA_FILE):
                    shutil.copyfile(DATA_FILE, BACKUP_FILE)
                tmp = DATA_FILE + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                    f.write("\n")
                os.replace(tmp, DATA_FILE)
                self.send(200, {"ok": True, "version": file_version()})
            elif url.path == "/api/upload":
                name = parse_qs(url.query).get("name", [""])[0]
                base, ext = os.path.splitext(os.path.basename(name))
                ext = ext.lower()
                if ext not in IMAGE_TYPES:
                    raise ValueError("only image files (jpg, png, webp, gif, avif)")
                base = re.sub(r"[^a-z0-9_-]+", "-", base.lower()).strip("-") or "image"
                os.makedirs(UPLOAD_DIR, exist_ok=True)
                filename, n = base + ext, 2
                while os.path.exists(os.path.join(UPLOAD_DIR, filename)):
                    filename, n = f"{base}-{n}{ext}", n + 1
                body = self.read_body(MAX_UPLOAD)
                with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
                    f.write(body)
                self.send(200, {"url": UPLOAD_URL + filename})
            else:
                self.send(404, {"error": "not found"})
        except (ValueError, json.JSONDecodeError) as e:
            self.send(400, {"error": str(e)})


def main():
    if not os.path.exists(DATA_FILE):
        sys.exit(f"Data file not found: {DATA_FILE}")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"Portfolio editor running at {url}  (Ctrl+C to stop)")
    print(f"Editing {os.path.relpath(DATA_FILE, ROOT)}")
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
