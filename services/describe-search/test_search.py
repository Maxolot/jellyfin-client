from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import unittest

import numpy as np

from search import Document, Index, phrase_match
from sources import local_document, shared_document
from server import handler

QUESTION = "le film où Morgan Freeman est président et où une comète arrive"

FIXTURE = [
    Document("deep", "movie", "Deep Impact", tmdb=8656, year=1998, keywords=("comète", "catastrophe"),
             overview="Une comète menace la Terre. Le président Tom Beck organise un plan de survie.",
             directors=("Mimi Leder",), cast=(("Morgan Freeman", "Président Tom Beck"),)),
    Document("bruce", "movie", "Bruce tout-puissant", tmdb=310, overview="Un homme ordinaire reçoit les pouvoirs de Dieu.",
             keywords=("comédie", "divinité"), cast=(("Morgan Freeman", "Dieu"), ("Jim Carrey", "Bruce"))),
    Document("armageddon", "movie", "Armageddon", tmdb=95, keywords=("astéroïde", "navette"),
             overview="Des foreurs tentent de détruire un astéroïde qui menace la Terre.", cast=(("Bruce Willis", "Harry"),)),
    Document("arrival", "movie", "Premier Contact", tmdb=329865, original="Arrival", keywords=("langage", "extraterrestre"),
             overview="Une linguiste apprend le langage de visiteurs extraterrestres."),
    Document("climate", "tv", "La Maison des nuages", tmdb=408, keywords=("climat",),
             overview="Un climatologue enquête sur les phénomènes météo d'une île de l'Atlantique.")
]


class FixtureEncoder:
    signature = "fixture-v1"

    def __init__(self):
        self.calls = 0

    def index(self, texts):
        self.calls += len(texts)
        return np.ones((len(texts), 3), np.float32)

    def query(self, text):
        return np.ones(3, np.float32)


class SearchTests(unittest.TestCase):
    def test_exact_and_tolerant_actor_role_and_keywords_select_the_right_film(self):
        with TemporaryDirectory() as directory:
            index = Index(Path(directory) / "test.sqlite3", FixtureEncoder())
            index.sync(FIXTURE)
            for query in (QUESTION, "film avec Morgan Freman qui est president et une comete"):
                with self.subTest(query=query):
                    result = index.find(query)[0]
                    self.assertEqual(result["title"], "Deep Impact")
                    self.assertEqual(result["reason"], "Morgan Freeman · comète")
            self.assertEqual(index.find("je veux voir Arrival")[0]["title"], "Premier Contact")
        self.assertEqual(phrase_match("morgan freeman", "avec morgan freman"), 0.75)

    def test_updates_only_changed_vectors_and_retains_the_current_snapshot(self):
        with TemporaryDirectory() as directory:
            source = FixtureEncoder()
            path = Path(directory) / "test.sqlite3"
            index = Index(path, source)
            self.assertEqual(index.sync(FIXTURE), len(FIXTURE))
            self.assertEqual(index.sync(FIXTURE), 0)
            self.assertEqual(source.calls, len(FIXTURE))
            changed = Document("deep", "movie", "Deep Impact", tmdb=8656, keywords=("comète",))
            self.assertEqual(index.sync([changed, FIXTURE[1]]), 1)
            self.assertEqual(source.calls, len(FIXTURE) + 1)
            self.assertEqual(len(Index(path, source).snapshot[0]), 2)

    def test_http_lookup_is_private_and_returns_at_most_the_requested_limit(self):
        with TemporaryDirectory() as directory:
            index = Index(Path(directory) / "test.sqlite3", FixtureEncoder())
            index.sync(FIXTURE)
            with ThreadingHTTPServer(("127.0.0.1", 0), handler(index, "fixture")) as server:
                thread = Thread(target=server.serve_forever)
                thread.start()
                try:
                    route = f"http://127.0.0.1:{server.server_port}/search?" + urlencode({"q": QUESTION, "limit": 1})
                    with self.assertRaises(HTTPError) as denied:
                        urlopen(route, timeout=2)
                    self.assertEqual(denied.exception.code, 401)
                    with urlopen(Request(route, headers={"Authorization": "Bearer fixture"}), timeout=2) as response:
                        results = json.load(response)["results"]
                        self.assertEqual(len(results), 1)
                        self.assertEqual(results[0]["title"], "Deep Impact")
                finally:
                    server.shutdown()
                    thread.join()

    def test_sources_keep_provider_identity_and_import_at_most_eight_roles(self):
        movie = local_document({
            "Id": "aabbccddaabbccddaabbccddaabbccdd", "Name": "Fixture", "Type": "Movie", "ProviderIds": {"Tmdb": "17"},
            "OriginalTitle": "Original", "Genres": ["Drame"], "Tags": ["approche"], "ProductionYear": 2001,
            "People": [{"Type": "Director", "Name": "Léa Test"}] +
                      [{"Type": "Actor", "Name": f"Acteur {i}", "Role": f"Partie {i}"} for i in range(10)]
        }, {"movie:17": {"keywords": ["mot-clé TMDb"]}})
        self.assertEqual(movie.tmdb, 17)
        self.assertEqual(len(movie.cast), 8)
        self.assertEqual(movie.directors, ("Léa Test",))
        self.assertIn("mot-clé TMDb", movie.keywords)
        shared = shared_document({"type": "tv", "id": 28, "title": "Suivie", "posterPath": "/fixture.jpg"},
                                 {"tv:28": {"cast": [{"name": "Zoé", "role": "pilote"}]}})
        self.assertIsNone(shared.item_id)
        self.assertEqual(shared.cast, (("Zoé", "pilote"),))
        self.assertEqual(shared.poster, "/fixture.jpg")


if __name__ == "__main__":
    unittest.main()
