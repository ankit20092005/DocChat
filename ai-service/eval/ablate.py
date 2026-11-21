"""Re-index original PDFs in a run-specific Atlas collection and compare retrieval settings."""

import json
import math
import sys
from collections import Counter
from itertools import product
from pathlib import Path
from time import monotonic, sleep
from uuid import uuid4

from pymongo import MongoClient
from pymongo.errors import PyMongoError
from pymongo.operations import SearchIndexModel

from app.config import BATCH_SIZE, MAX_UPLOAD_BYTES
from app.ingestion import extract_pages
from app.models import Models
from .eval import Connection, arguments, first_rank, load_questions, metrics, resolve_cases

DEPTH = 12
INDEX = "eval_embeddings"
DEFINITION = Path(__file__).resolve().parents[1] / "atlas-vector-index.json"


def windows(text, offsets, size, overlap):
    for start in range(0, len(offsets), size - overlap):
        end = min(start + size, len(offsets))
        yield text[offsets[start][0]:offsets[end - 1][1]]
        if end == len(offsets):
            break


def build_corpus(collection, models, user, docs, folder, variants):
    root = folder.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("--pdf-dir must be a directory of original PDFs.")
    if len({d["filename"] for d in docs}) != len(docs):
        raise ValueError("Use unique filenames for the ablation corpus.")
    counts = Counter()
    batch = []

    def flush():
        if batch:
            vectors = models.embed([row["text"] for row in batch])
            for row, vector in zip(batch, vectors, strict=True):
                row["embedding"] = vector
            collection.insert_many(batch)
            batch.clear()

    for doc in docs:
        path = (root / doc["filename"]).resolve(strict=True)
        if path.parent != root or not path.is_file():
            raise ValueError("Each source PDF must be a file directly inside --pdf-dir.")
        length = path.stat().st_size
        if length != doc["sizeBytes"] or length > MAX_UPLOAD_BYTES:
            raise ValueError(f"Use the original uploaded bytes for {doc['filename']!r}.")
        pages = extract_pages(path)
        if len(pages) != doc["pages"]:
            raise ValueError(f"Page count changed for {doc['filename']!r}.")
        has_text = False
        for page, text in enumerate(pages, 1):
            offsets = models.offsets(text)
            if offsets:
                has_text = True
            for size, overlap in variants:
                variant = f"{size}/{overlap}"
                for part in windows(text, offsets, size, overlap):
                    batch.append({"user_id": user, "doc_id": doc["_id"], "page": page,
                                  "variant": variant, "text": part})
                    counts[variant] += 1
                    if len(batch) == BATCH_SIZE:
                        flush()
        if not has_text:
            raise ValueError(f"No extractable text in {doc['filename']!r}.")
    flush()
    return counts


def build_index(collection, timeout):
    definition = json.loads(DEFINITION.read_text(encoding="utf-8"))
    definition["fields"].append({"type": "filter", "path": "variant"})
    collection.create_search_index(SearchIndexModel(name=INDEX, type="vectorSearch", definition=definition))
    # All inserts precede index creation. READY then covers the complete, immutable run corpus.
    deadline = monotonic() + timeout
    while monotonic() < deadline:
        index = next(iter(collection.list_search_indexes(INDEX)), {})
        if index.get("status") == "READY" and index.get("queryable"):
            return
        if index.get("status") in {"FAILED", "DELETING"}:
            raise ValueError("Atlas could not build the scratch vector index. Inspect its status in Atlas.")
        sleep(2)
    raise TimeoutError("Timed out waiting for the scratch vector index. Increase --index-timeout if needed.")


def candidates(collection, user, ids, variant, vector):
    return list(collection.aggregate([
        {"$vectorSearch": {
            "index": INDEX, "path": "embedding", "queryVector": vector,
            "numCandidates": 240, "limit": DEPTH,
            "filter": {"$and": [{"user_id": {"$eq": user}}, {"doc_id": {"$in": ids}},
                                {"variant": {"$eq": variant}}]},
        }},
        {"$project": {"_id": 0, "doc_id": 1, "page": 1, "text": 1}},
    ], maxTimeMS=15000))


def compare(collection, models, user, ids, cases, variants, cutoffs, counts):
    vectors = models.embed([case.label.question for case in cases])
    print("| Tokens | Overlap | Chunks | Re-ranker | k | Questions | Hits | Hit-rate@k | MRR@k | MRR@12 |")
    print("|---:|---:|---:|:---|---:|---:|---:|---:|---:|---:|")
    for size, overlap in variants:
        variant = f"{size}/{overlap}"
        ranks = {"off": [], "on": []}
        for case, vector in zip(cases, vectors, strict=True):
            raw = candidates(collection, user, ids, variant, vector)
            scores = models.score(case.label.question, [row["text"] for row in raw]) if raw else []
            scored = sorted(((row, score) for row, score in zip(raw, scores, strict=True) if math.isfinite(score)),
                            key=lambda pair: pair[1], reverse=True)
            for mode, rows in (("off", raw), ("on", [row for row, _ in scored])):
                ranks[mode].append(first_rank(case, ((str(row["doc_id"]), row["page"]) for row in rows)))
        for mode, k in product(ranks, cutoffs):
            hits, rate, mrr_k, mrr = metrics(ranks[mode], k)
            print(f"| {size} | {overlap} | {counts[variant]} | {mode} | {k} | {len(cases)} | "
                  f"{hits} | {rate:.4f} | {mrr_k:.4f} | {mrr:.4f} |", flush=True)


def run(args):
    config = Connection()
    if args.scratch_db.casefold() in {config.mongodb_db.casefold(), "admin", "config", "local"}:
        raise ValueError("Choose a separate scratch database.")
    variants = list(product(dict.fromkeys(args.sizes), dict.fromkeys(args.overlaps)))
    if any(size < 1 or not 0 <= overlap < size for size, overlap in variants):
        raise ValueError("Each chunk size must exceed every overlap, and overlaps must be nonnegative.")
    if args.index_timeout < 1:
        raise ValueError("--index-timeout must be positive.")
    labels = load_questions(args.questions)
    with MongoClient(config.mongodb_uri.get_secret_value(), serverSelectionTimeoutMS=10000) as client:
        docs, cases = resolve_cases(client[config.mongodb_db], args.user_id, args.doc_ids, labels)
        models = Models()
        name = "chunks_" + uuid4().hex
        scratch = client[args.scratch_db].create_collection(name)
        try:
            print(f"Scratch collection: {scratch.full_name}", file=sys.stderr, flush=True)
            counts = build_corpus(scratch, models, args.user_id, docs, args.pdf_dir, variants)
            build_index(scratch, args.index_timeout)
            compare(scratch, models, args.user_id, args.doc_ids, cases, variants, sorted(set(args.ks)), counts)
        finally:
            scratch.drop()


def main():
    parser = arguments("Ablate chunking, top-k and re-ranking using an isolated Atlas vector index.")
    parser.add_argument("--pdf-dir", type=Path, required=True)
    parser.add_argument("--scratch-db", required=True, help="Dedicated writable Atlas database.")
    parser.add_argument("--sizes", type=int, nargs="+", default=[200, 400, 800])
    parser.add_argument("--overlaps", type=int, nargs="+", default=[0, 60])
    parser.add_argument("--ks", type=int, choices=range(1, DEPTH + 1), nargs="+", default=[1, 4, 8])
    parser.add_argument("--index-timeout", type=int, default=900, metavar="SECONDS")
    try:
        run(parser.parse_args())
    except PyMongoError as exc:
        parser.exit(1, f"Atlas failed ({type(exc).__name__}). Check scratch permissions, quota and index readiness.\n")
    except (OSError, ValueError) as exc:
        parser.exit(1, f"{exc}\n")


if __name__ == "__main__":
    main()
