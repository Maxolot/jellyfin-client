from __future__ import annotations

from contextlib import closing
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from functools import cache
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from threading import Lock
from typing import Callable, Protocol
import unicodedata

import numpy as np

MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
TOKEN = re.compile(r"[^\W_]+", re.UNICODE)
STOP = set("""
a au aux de des du d en et il elle les le la l un une que qui ou dans avec je veux cherche
film films serie series lequel laquelle ce cet cette est arrive ou on par sont sur pour
and the is of to in for an a with film movie show series
""".split())


@dataclass(frozen=True)
class Document:
    key: str
    kind: str
    title: str
    item_id: str | None = None
    tmdb: int | None = None
    original: str = ""
    year: int | None = None
    genres: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    overview: str = ""
    directors: tuple[str, ...] = ()
    cast: tuple[tuple[str, str], ...] = ()
    poster: str | None = None

    def text(self) -> str:
        actors = (f"{actor} — {role}" if role else actor for actor, role in self.cast)
        return ". ".join(filter(None, [
            self.title, self.original, str(self.year or ""), ", ".join(self.genres),
            ", ".join(self.keywords), ", ".join(self.directors), ", ".join(actors), self.overview
        ]))


class Encoder(Protocol):
    signature: str

    def index(self, texts: list[str]) -> np.ndarray: ...
    def query(self, text: str) -> np.ndarray: ...


class FastEmbedEncoder:
    signature = MODEL + ":1"

    def __init__(self, cache: Path, threads: int = 2, offline: bool = True):
        from fastembed import TextEmbedding

        self.model = TextEmbedding(
            model_name=MODEL, cache_dir=str(cache), threads=threads,
            providers=["CPUExecutionProvider"], local_files_only=offline, enable_cpu_mem_arena=False
        )
        self.lock = Lock()

    def index(self, texts: list[str]) -> np.ndarray:
        with self.lock:
            return np.asarray(list(self.model.embed(texts, batch_size=12)), dtype=np.float32)

    def query(self, text: str) -> np.ndarray:
        with self.lock:
            return np.asarray(next(iter(self.model.query_embed([text]))), dtype=np.float32)


def normalize(text: str) -> str:
    pieces = unicodedata.normalize("NFKD", text.casefold())
    without = "".join(character for character in pieces if not unicodedata.combining(character))
    return " ".join(TOKEN.findall(without))


def normalize_rows(rows: np.ndarray) -> np.ndarray:
    return rows / np.maximum(np.linalg.norm(rows, axis=-1, keepdims=True), 1e-9)


def phrase_match(phrase: str, query: str) -> float:
    words = phrase.split()
    if not words:
        return 0.0
    if f" {phrase} " in f" {query} ":
        return 1.0
    if len(phrase) < 5:
        return 0.0
    query_words = query.split()
    if not any(part[0] == words[0][0] and abs(len(part) - len(words[0])) <= 2 for part in query_words):
        return 0.0
    windows = (" ".join(query_words[index:index + len(words)]) for index in range(len(query_words) - len(words) + 1))
    ratio = max((SequenceMatcher(None, phrase, window, autojunk=False).ratio() for window in windows), default=0.0)
    return 0.75 if ratio >= (0.84 if len(words) > 1 else 0.88) else 0.0


@dataclass(frozen=True)
class SearchDocument:
    document: Document
    titles: tuple[str, ...]
    people: tuple[tuple[str, str], ...]
    roles: set[str]
    concepts: tuple[tuple[str, str], ...]
    words: set[str]

    @classmethod
    def from_document(cls, document: Document) -> SearchDocument:
        names = (*document.directors, *(name for name, _ in document.cast))
        terms = (*document.keywords, *document.genres, *TOKEN.findall(document.overview))
        concepts = tuple(dict.fromkeys((normalize(term), term) for term in terms if normalize(term) not in STOP and len(term) > 2))
        return cls(document, tuple(filter(None, (normalize(document.title), normalize(document.original)))),
                   tuple((normalize(name), name) for name in names),
                   set(normalize(" ".join(role for _, role in document.cast)).split()),
                   concepts, set(normalize(document.text()).split()))


def rank(document: SearchDocument, match: Callable[[str], float], meaningful: set[str], semantic: float) -> tuple[float, str]:
    title = max((match(value) for value in document.titles), default=0.0)
    people = [(match(person), label) for person, label in document.people]
    person, name = max(people, default=(0.0, ""), key=lambda entry: entry[0])
    role = len(document.roles & meaningful)
    shared = document.words & meaningful
    coverage = len(shared) / max(1, len(meaningful))
    concept = next((label for value, label in document.concepts if value in meaningful), "")
    score = 0.60 * max(0.0, float(semantic)) + min(0.48, title * 0.42 + person * 0.27 + min(role, 2) * 0.12 + coverage * 0.23)
    details = [label for label in (name if person else "", concept) if label]
    if not details and title:
        details.append(document.document.title)
    return min(1.0, score), " · ".join(details) if details else "Résumé proche"


class Index:
    def __init__(self, path: Path, encoder: Encoder):
        self.path = path
        self.encoder = encoder
        self.update_lock = Lock()
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(path)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, digest TEXT, document TEXT, vector BLOB)")
            db.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            stored = db.execute("SELECT value FROM meta WHERE key='model'").fetchone()
            if stored != (encoder.signature,):
                db.execute("DELETE FROM documents")
                db.execute("INSERT OR REPLACE INTO meta VALUES ('model', ?)", (encoder.signature,))
        self.snapshot = self.read()

    def read(self) -> tuple[list[SearchDocument], np.ndarray]:
        with closing(sqlite3.connect(self.path)) as db:
            data = db.execute("SELECT document, vector FROM documents ORDER BY key").fetchall()
        documents = [SearchDocument.from_document(Document(**json.loads(raw))) for raw, _ in data]
        vectors = np.stack([np.frombuffer(blob, dtype="<f4") for _, blob in data]) if data else np.empty((0, 0), dtype=np.float32)
        return documents, vectors

    def sync(self, documents: list[Document]) -> int:
        with self.update_lock, closing(sqlite3.connect(self.path)) as db:
            existing = dict(db.execute("SELECT key, digest FROM documents"))
            modified = []
            for document in documents:
                serialized = json.dumps(asdict(document), ensure_ascii=False, sort_keys=True)
                digest = hashlib.sha256(serialized.encode()).hexdigest()
                if existing.pop(document.key, None) != digest:
                    modified.append((document, digest, serialized))
            for start in range(0, len(modified), 48):
                group = modified[start:start + 48]
                matrix = normalize_rows(self.encoder.index([document.text() for document, _, _ in group]))
                db.executemany("INSERT OR REPLACE INTO documents VALUES (?, ?, ?, ?)",
                               ((doc.key, digest, raw, vec.astype("<f4").tobytes())
                                for (doc, digest, raw), vec in zip(group, matrix, strict=True)))
            db.executemany("DELETE FROM documents WHERE key=?", ((key,) for key in existing))
            db.commit()
            self.snapshot = self.read()
            return len(modified)

    def find(self, text: str, limit: int = 10) -> list[dict]:
        documents, vectors = self.snapshot
        query = normalize(text)
        meaningful = set(query.split()) - STOP
        if not documents or not query or not meaningful:
            return []
        vector = normalize_rows(self.encoder.query(text))
        similarities = vectors @ vector
        @cache
        def match(phrase: str) -> float:
            return phrase_match(phrase, query)
        ranked = [(rank(document, match, meaningful, similarity), document.document)
                  for document, similarity in zip(documents, similarities, strict=True)]
        ranked.sort(key=lambda row: (-row[0][0], row[1].key))
        return [
            {"itemId": doc.item_id, "tmdb": doc.tmdb, "type": doc.kind, "title": doc.title,
             "poster": doc.poster, "score": round(score, 4), "reason": reason}
            for (score, reason), doc in ranked[:limit] if score >= 0.22
        ]
