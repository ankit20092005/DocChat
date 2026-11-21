import json
from secrets import token_hex
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from bson import ObjectId
from httpx_sse import EventSource
from pydantic import SecretStr

from app import main, retrieval
from app.llm import GenerationError

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def api(monkeypatch):
    key = token_hex(32)
    settings = SimpleNamespace(internal_key=SecretStr(key), vector_index="chunks", rerank_threshold=0.5)
    db, models = Mock(), Mock()
    db.documents.distinct.return_value = []
    models.embed.return_value = [[0.0] * 384]
    for name, value in (("db", db), ("models", models), ("settings", settings)):
        monkeypatch.setattr(main.app.state, name, value, raising=False)
    ask = {"user_id": str(ObjectId()), "doc_ids": [str(ObjectId())], "question": "When are refunds due?"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test",
                                 headers={"X-Internal-Key": key}) as client:
        yield client, ask, db, models


def events(response):
    assert response.status_code == 200
    return [(e.event, e.data) for e in EventSource(response).iter_sse()]


@pytest.mark.parametrize("score", [None, 0.499])
async def test_guardrail_skips_provider(api, monkeypatch, score):
    client, ask, db, models = api
    doc = ask["doc_ids"][0]
    if score is not None:
        db.documents.distinct.return_value = [ObjectId(doc)]
        db.chunks.aggregate.return_value = [
            {"chunk_id": str(ObjectId()), "doc_id": doc, "filename": "terms.pdf", "page": 1, "text": "Terms"},
        ]
        models.score.return_value = [score]
    provider = Mock(side_effect=AssertionError("Guardrail called the LLM"))
    monkeypatch.setattr(retrieval, "generate_stream", provider)
    assert events(await client.post("/ask", json=ask)) == [
        ("token", "I couldn't find this in your documents."), ("sources", "[]"), ("done", '{"ok": true}'),
    ]
    provider.assert_not_called()
    if score is None:
        db.chunks.aggregate.assert_not_called()


async def test_scoped_search_reranking_and_stream(api, monkeypatch):
    client, ask, db, models = api
    ask["question"] = "ok explain me polymorphism"
    doc, user = ObjectId(ask["doc_ids"][0]), ObjectId(ask["user_id"])
    ask["doc_ids"].append(str(ObjectId()))
    ask["history"] = [{"role": "user", "content": str(i)} for i in range(6)]
    db.documents.distinct.return_value = [doc]
    db.chunks.aggregate.return_value = [
        {"chunk_id": str(ObjectId()), "doc_id": str(doc), "filename": "terms.pdf", "page": i, "text": f"Page {i}"}
        for i in range(1, 13)
    ]
    models.score.return_value = [i / 24 for i in range(1, 13)]

    async def provider(prompt):
        payload = json.loads(prompt.user)
        assert payload["question"] == ask["question"]
        assert payload["history"] == ask["history"][-4:]
        assert [c["page"] for c in payload["context"]] == [12, 11, 10, 9]
        yield "Thirty days.\n[terms.pdf, p.12]"

    monkeypatch.setattr(retrieval, "generate_stream", provider)
    result = events(await client.post("/ask", json=ask))
    models.embed.assert_called_once_with(["polymorphism"])
    assert models.score.call_args.args[0] == "polymorphism"
    db.documents.distinct.assert_called_once_with(
        "_id", {"_id": {"$in": [ObjectId(i) for i in ask["doc_ids"]]}, "userId": user, "status": "ready"},
    )
    stage = db.chunks.aggregate.call_args.args[0][0]["$vectorSearch"]
    assert stage["filter"] == {"$and": [{"user_id": {"$eq": user}}, {"doc_id": {"$in": [doc]}}]}
    assert stage["limit"] == 12 and len(stage["queryVector"]) == 384
    assert [kind for kind, _ in result] == ["token", "sources", "done"]
    assert result[0][1] == "Thirty days.\n[terms.pdf, p.12]"
    assert [s["page"] for s in json.loads(result[1][1])] == [12, 11, 10, 9]
    assert json.loads(result[2][1]) == {"ok": True}


async def test_partial_provider_failure(api, monkeypatch):
    client, ask, _, _ = api
    source = retrieval.Source(chunk_id=str(ObjectId()), doc_id=ask["doc_ids"][0],
                              filename="terms.pdf", page=1, text="Terms", score=0.9)
    monkeypatch.setattr(main, "retrieve", lambda *args: [source])

    async def interrupted(prompt):
        yield "Partial"
        raise GenerationError("Answer generation timed out.")

    monkeypatch.setattr(retrieval, "generate_stream", interrupted)
    result = events(await client.post("/ask", json=ask))
    assert result[:2] == [("token", "Partial"), ("sources", "[]")]
    assert json.loads(result[2][1]) == {"ok": False, "error": "Answer generation timed out."}


async def test_internal_access_and_validation(api):
    client, ask, _, _ = api
    assert (await client.post("/ask", json={**ask, "doc_ids": []})).status_code == 422
    assert (await client.post("/ask", json={**ask, "user_id": "invalid"})).status_code == 422
    client.headers.pop("X-Internal-Key")
    assert (await client.get("/health")).status_code == 200
    for method, path in [("POST", "/ask"), ("POST", "/ingest"), ("DELETE", "/documents/invalid")]:
        assert (await client.request(method, path)).status_code == 401


async def test_multipart_handoff_and_size_limit(api, monkeypatch):
    client, ask, db, _ = api
    fields = {"doc_id": ask["doc_ids"][0], "user_id": ask["user_id"]}
    db.documents.find_one_and_update.return_value = {"filename": "owned.pdf"}
    observed = []

    def worker(path, filename, db, models, job):
        observed.append((path.read_bytes(), filename, str(job.doc_id), str(job.user_id)))
        path.unlink()

    monkeypatch.setattr(main, "ingest_pdf", worker)
    files = {"file": ("upload.pdf", b"%PDF-test", "application/pdf")}
    response = await client.post("/ingest", files=files, data=fields)
    assert response.status_code == 202
    assert observed == [(b"%PDF-test", "owned.pdf", fields["doc_id"], fields["user_id"])]
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 8)
    assert (await client.post("/ingest", files=files, data=fields)).status_code == 413

    async def oversized_body():
        yield b'--x\r\nContent-Disposition: form-data; name="file"; filename="x.pdf"\r\n\r\n'
        yield b"x" * 65536
        yield b"\r\n--x--\r\n"

    response = await client.post("/ingest", content=oversized_body(),
                                 headers={"Content-Type": "multipart/form-data; boundary=x"})
    assert response.status_code == 413
