from pathlib import Path
from tempfile import TemporaryDirectory
import argparse
import resource
import statistics
from time import perf_counter

from search import Document, FastEmbedEncoder, Index
from test_search import FIXTURE, QUESTION


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--titles", type=int, default=1000)
    args = parser.parse_args()
    synthetic = [
        Document(f"fixture:{i}", "movie", f"Récit d’îles {i}", tmdb=10_000 + i, year=1990 + i % 30,
                 overview=f"Un naturaliste visite l’île numéro {i} pour observer les oiseaux et cartographier le littoral.",
                 keywords=("nature", "îles"), cast=(("Lou Marais", "naturaliste"),))
        for i in range(max(0, args.titles - len(FIXTURE)))
    ]
    with TemporaryDirectory() as directory:
        index = Index(Path(directory) / "benchmark.sqlite3", FastEmbedEncoder(args.model))
        started = perf_counter()
        size = index.sync([*FIXTURE, *synthetic])
        indexing = perf_counter() - started
        first = index.find(QUESTION)
        if not first or first[0]["title"] != "Deep Impact" or first[0]["reason"] != "Morgan Freeman · comète":
            raise RuntimeError("The phrased query did not put Deep Impact first with its reasons")
        elapsed = []
        for _ in range(15):
            tick = perf_counter()
            index.find(QUESTION)
            elapsed.append((perf_counter() - tick) * 1000)
        print(f"{size} titres : indexation {indexing:.2f} s, recherche médiane {statistics.median(elapsed):.1f} ms, "
              f"pic RSS {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024:.1f} Mio.")
        print("Deep Impact ·", first[0]["reason"])


if __name__ == "__main__":
    main()
