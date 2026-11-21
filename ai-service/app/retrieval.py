import json
import logging
import math
import re
from collections.abc import AsyncIterator
from contextlib import aclosing

from bson import ObjectId
from pymongo.database import Database

from .llm import GenerationError, generate_stream
from .models import Models
from .prompts import build_prompt
from .schemas import Ask, Source

log = logging.getLogger(__name__)
ABSTENTION = "I couldn't find this in your documents."

# A passage answers the topic following "explain". Conversational lead-ins
# can dominate the cross-encoder score even when the passage defines the term.
_EXPLAIN_PREFIX = re.compile(
    r"^(?:(?:ok(?:ay)?|hey)[,\s]+)?(?:(?:can|could|would) you\s+)?"
    r"(?:please\s+)?explain\s+(?:(?:to\s+)?me\s+)?", re.IGNORECASE,
)


def search_question(question: str) -> str:
    topic = _EXPLAIN_PREFIX.sub("", question, count=1).strip()
    return topic if topic and any(c.isalnum() for c in topic) else question


def retrieve(db: Database, models: Models, index: str, ask: Ask) -> list[Source]:
    user = ObjectId(ask.user_id)
    scope = {"userId": user, "_id": {"$in": [ObjectId(i) for i in ask.doc_ids]}, "status": "ready"}
    allowed = db.documents.distinct("_id", scope)
    hits = []
    query = search_question(ask.question)
    if allowed:
        vector = models.embed([query])[0]
        hits = list(db.chunks.aggregate([
            {"$vectorSearch": {
                "index": index, "path": "embedding", "queryVector": vector,
                "numCandidates": 240, "limit": 12,
                "filter": {"$and": [{"user_id": {"$eq": user}}, {"doc_id": {"$in": allowed}}]},
            }},
            # Recheck publication and ownership if a concurrent upload or delete ran.
            {"$lookup": {"from": "documents", "localField": "docId", "foreignField": "_id",
                         "pipeline": [{"$match": scope}, {"$project": {"_id": 1}}], "as": "owner"}},
            {"$match": {"owner.0": {"$exists": True}}},
            {"$project": {"_id": 0, "chunk_id": {"$toString": "$_id"}, "doc_id": {"$toString": "$docId"},
                          "filename": 1, "page": 1, "text": 1}},
        ], maxTimeMS=15000))
    scores = models.score(query, [hit["text"] for hit in hits]) if hits else []
    ranked = sorted(
        (Source(**hit, score=score) for hit, score in zip(hits, scores, strict=True)
         if math.isfinite(score)),
        key=lambda source: source.score, reverse=True,
    )
    log.info("question=%r ranked_chunks=%s", ask.question, [(s.chunk_id, s.score) for s in ranked])
    return ranked[:4]


def sse(event: str, data: str) -> str:
    # Prefix every line, including trailing empty lines, to preserve token text.
    lines = data.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return f"event: {event}\n" + "".join(f"data: {line}\n" for line in lines) + "\n"


async def answer_events(ask: Ask, sources: list[Source], threshold: float) -> AsyncIterator[str]:
    done = {"ok": True}
    if not sources or sources[0].score < threshold:
        sources = []
        yield sse("token", ABSTENTION)
    else:
        try:
            async with aclosing(generate_stream(build_prompt(ask, sources))) as tokens:
                async for token in tokens:
                    yield sse("token", token)
        except GenerationError as exc:
            log.warning("Answer generation failed: %s", exc)
            done = {"ok": False, "error": str(exc)}
            sources = []
    yield sse("sources", json.dumps([s.model_dump() for s in sources], ensure_ascii=False))
    yield sse("done", json.dumps(done))
