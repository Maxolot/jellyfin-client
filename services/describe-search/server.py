from __future__ import annotations

from hmac import compare_digest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
from threading import Event, Thread
from urllib.parse import parse_qs, urlsplit

from search import FastEmbedEncoder, Index
from sources import Sources


def optional_path(variable: str) -> Path | None:
    value = os.getenv(variable)
    return Path(value) if value else None


def handler(index: Index, token: str):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            return

        def send_json(self, status: int, data: dict):
            body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path == "/health":
                self.send_json(200, {"indexed": len(index.snapshot[0])})
                return
            if url.path != "/search":
                self.send_json(404, {})
                return
            if token and not compare_digest(self.headers.get("Authorization", "").encode(), f"Bearer {token}".encode()):
                self.send_json(401, {})
                return
            if len(url.query) > 3000:
                self.send_json(400, {})
                return
            params = parse_qs(url.query)
            query = params.get("q", [""])[0].strip()
            try:
                limit = min(50, max(1, int(params.get("limit", ["10"])[0])))
            except ValueError:
                self.send_json(400, {})
                return
            if not query or len(query) > 240:
                self.send_json(400, {})
                return
            try:
                self.send_json(200, {"results": index.find(query, limit)})
            except Exception as error:
                logging.error("Search failed (%s)", type(error).__name__)
                self.send_json(503, {"error": "searchUnavailable"})
    return Handler


def reindex(index: Index, sources: Sources, interval: int, stop: Event):
    while not stop.is_set():
        try:
            documents = sources.all()
            changed = index.sync(documents)
            logging.info("Index ready: %d titles (%d embedded).", len(documents), changed)
        except Exception as error:
            # Addresses, credentials and document contents are never passed to the logger.
            logging.error("Index refresh failed (%s). Previous index remains usable.", type(error).__name__)
        stop.wait(interval)


def main():
    logging.basicConfig(level=logging.INFO)
    sources = Sources(os.environ["JELLYFIN_URL"], os.environ["JELLYFIN_KEY"],
                      optional_path("SHARED_CATALOG_PATH"), optional_path("METADATA_PATH"),
                      os.getenv("JELLYFIN_USER_ID"))
    encoder = FastEmbedEncoder(Path(os.getenv("MODEL_CACHE", "/opt/describe-model")))
    index = Index(Path(os.getenv("INDEX_PATH", "/data/catalog.sqlite3")), encoder)
    interval = max(60, int(os.getenv("REINDEX_SECONDS", "900")))
    stop = Event()
    worker = Thread(target=reindex, args=(index, sources, interval, stop), daemon=True, name="reindex")
    worker.start()
    with ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "8080"))),
                             handler(index, os.getenv("DESCRIBE_SERVICE_TOKEN", ""))) as server:
        try:
            server.serve_forever()
        finally:
            stop.set()


if __name__ == "__main__":
    main()
