from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID

from search import Document

FIELDS = "OriginalTitle,Overview,Genres,Tags,People,ProviderIds"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def integer(value, minimum: int = 1) -> int | None:
    try:
        result = int(value)
        return result if result >= minimum else None
    except (TypeError, ValueError):
        return None


def guid(value) -> str | None:
    try:
        return UUID(str(value)).hex
    except ValueError:
        return None


def text(value, limit: int = 4000) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def values(value, limit: int = 50) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(filter(None, (text(entry, 120) for entry in value[:limit])))


def metadata_for(extra: dict, kind: str, tmdb: int | None) -> dict:
    entry = extra.get(f"{kind}:{tmdb}")
    return entry if isinstance(entry, dict) else {}


def read_json(path: Path, expected):
    if not path.exists():
        return expected
    with path.open(encoding="utf8") as stream:
        value = json.load(stream)
    if not isinstance(value, type(expected)):
        raise ValueError("Unexpected source format")
    return value


def local_document(row: dict, extra: dict) -> Document | None:
    item_id = guid(row.get("Id"))
    title = text(row.get("Name"), 300)
    kind = {"Movie": "movie", "Series": "tv"}.get(row.get("Type"))
    if not item_id or not title or not kind or row.get("LocationType") == "Virtual" or row.get("IsPlaceHolder"):
        return None
    providers = row.get("ProviderIds") or {}
    tmdb = integer(providers.get("Tmdb") or providers.get("tmdb"))
    override = metadata_for(extra, kind, tmdb)
    people = row.get("People") or []
    cast = tuple((text(person.get("Name"), 120), text(person.get("Role"), 120))
                 for person in people if person.get("Type") == "Actor" and person.get("Name"))[:8]
    directors = tuple(text(person.get("Name"), 120) for person in people
                      if person.get("Type") == "Director" and person.get("Name"))[:8]
    keywords = tuple(dict.fromkeys((*values(override.get("keywords")), *values(row.get("Tags")))))
    return Document(f"local:{item_id}", kind, title, item_id, tmdb, text(row.get("OriginalTitle"), 300),
                    integer(row.get("ProductionYear")), values(row.get("Genres")), keywords, text(row.get("Overview")), directors, cast)


def shared_document(row: dict, extra: dict) -> Document | None:
    kind = row.get("type")
    tmdb = integer(row.get("id"))
    title = text(row.get("title"), 300)
    if kind not in ("movie", "tv") or not tmdb or not title:
        return None
    override = metadata_for(extra, kind, tmdb)
    actors = override.get("cast") or []
    cast = tuple((text(entry.get("name"), 120), text(entry.get("role"), 120))
                 for entry in actors if isinstance(entry, dict) and entry.get("name"))[:8]
    return Document(f"shared:{kind}:{tmdb}", kind, title, tmdb=tmdb,
                    original=text(override.get("originalTitle"), 300), year=integer(row.get("year")),
                    genres=values(override.get("genres")), keywords=values(override.get("keywords")),
                    overview=text(row.get("overview")) or text(override.get("overview")),
                    directors=values(override.get("directors"), 8), cast=cast, poster=text(row.get("posterPath"), 180) or None)


class Sources:
    def __init__(self, url: str, key: str, catalog: Path | None, metadata: Path | None):
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Invalid Jellyfin base URL")
        if not key:
            raise ValueError("Missing Jellyfin API key")
        self.url = url.rstrip("/")
        self.key = key
        self.catalog = catalog
        self.metadata = metadata
        self.http = build_opener(NoRedirect())

    def local(self, extra: dict):
        offset = 0
        page_size = 250
        while True:
            query = urlencode({"recursive": "true", "includeItemTypes": "Movie,Series", "fields": FIELDS,
                               "enableImages": "false", "enableUserData": "false", "startIndex": offset,
                               "limit": page_size, "sortBy": "SortName", "sortOrder": "Ascending"})
            request = Request(f"{self.url}/Items?{query}", headers={"X-Emby-Token": self.key, "Accept": "application/json"})
            with self.http.open(request, timeout=12) as response:
                payload = json.load(response)
            items = payload.get("Items")
            total = payload.get("TotalRecordCount")
            if not isinstance(items, list) or not isinstance(total, int) or total < 0:
                raise ValueError("Incomplete Jellyfin library response")
            for item in items:
                document = local_document(item, extra)
                if document:
                    yield document
            offset += len(items)
            if offset >= total:
                return
            if not items:
                raise ValueError("Jellyfin library changed during pagination")

    def all(self) -> list[Document]:
        extra = read_json(self.metadata, {}) if self.metadata else {}
        documents = {document.key: document for document in self.local(extra)}
        if self.catalog:
            for row in read_json(self.catalog, []):
                document = shared_document(row, extra)
                if document:
                    documents[document.key] = document
        return list(documents.values())
