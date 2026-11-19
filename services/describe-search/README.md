# Recherche par description

Le service indexe les films et séries Jellyfin et les entrées suivies du
catalogue partagé. Il combine la proximité sémantique avec des bonus sur les
titres, noms, rôles et mots-clés. Les résultats incluent le score et le ou les
indices qui ont contribué au rapprochement. La recherche et l’indexation
s’exécutent sur CPU avec le modèle multilingue
[paraphrase-multilingual-MiniLM-L12-v2](https://qdrant.tech/documentation/embeddings/fastembed/)
de FastEmbed, en ONNX. Le modèle est mis en cache lors de la construction de
l’image. Le service l’ouvre ensuite en mode local.

## Configuration

Le fichier `compose.example.yml` illustre le raccordement au réseau interne
partagé avec Jellyfin. Le port HTTP reste sur ce réseau.

| Variable | Source |
| --- | --- |
| `JELLYFIN_URL` | URL interne de Jellyfin |
| `JELLYFIN_KEY` | Clé privée permettant de lire la bibliothèque |
| `DESCRIBE_SERVICE_TOKEN` | Jeton privé partagé avec le plugin |
| `SHARED_CATALOG_PATH` | Chemin du `catalog.json` du plugin, monté en lecture seule |
| `METADATA_PATH` | Export facultatif de métadonnées locales, monté en lecture seule |
| `INDEX_PATH` | Base SQLite persistante, par défaut `/data/catalog.sqlite3` |
| `REINDEX_SECONDS` | Intervalle de mise à jour, par défaut 900 s |

Les tags de Jellyfin alimentent les mots-clés. Un export local peut fournir
les mots-clés TMDb et compléter les titres suivis qui disposent de moins de
métadonnées. L’export facultatif utilise des clés `movie:<id>` ou
`tv:<id>` et les champs `originalTitle`, `overview`, `genres`,
`keywords`, `directors` et `cast`. Chaque acteur a un `name` et un
`role`. Les vecteurs sont recalculés seulement si les données changent.
Une lecture Jellyfin incomplète conserve le dernier index utilisable.

Dans les données privées du plugin Shared Catalog 0.6.2, `describe.json` contient
les champs `url` (URL interne du service) et `token` (même valeur que
`DESCRIBE_SERVICE_TOKEN`). La route Jellyfin authentifiée
`GET /SharedCatalog/Describe?q=…` contrôle la visibilité de chaque résultat
en bibliothèque et vérifie que les titres externes sont encore suivis.
Le résultat s’arrête à dix titres après ces contrôles.

## Vérification locale

```sh
python -m unittest discover -s services/describe-search
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 OPENBLAS_NUM_THREADS=1 \
  python services/describe-search/benchmark.py --model /opt/describe-model --titles 1000
```

Sur 1 000 titres de fixture, l’indexation initiale prend 13,38 s. La médiane
sur quinze recherches est de 12,3 ms et le pic RSS du processus est de 682 Mio.
La recherche « le film où Morgan Freeman est président et où une comète arrive »
place Deep Impact en tête avec le motif « Morgan Freeman · comète ».
