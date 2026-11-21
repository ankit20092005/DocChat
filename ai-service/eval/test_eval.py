import asyncio
import json
import re
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pymupdf
import pytest
from bson import ObjectId
from pydantic import SecretStr

from app.ingestion import page_chunks
from app.schemas import Ask, Source
from eval import ablate
from eval import eval as evaluation


def sample(doc_id):
    label = evaluation.Question(question="When does the library open?", expected_doc="guide.pdf",
                                expected_page=2, expected_keywords=["09:00"])
    return evaluation.Case(label, doc_id)


def offsets(text):
    return [word.span() for word in re.finditer(r"\S+", text)]


def test_ranks_require_document_and_page_and_count_misses():
    doc, other = ObjectId(), ObjectId()
    case = sample(doc)
    assert evaluation.first_rank(case, [(str(other), 2), (str(doc), 1), (str(doc), 2), (str(doc), 2)]) == 3
    assert evaluation.first_rank(case, []) == 0
    assert evaluation.metrics([1, 3, 0], 2) == pytest.approx((1, 1/3, 1/3, 4/9))


def test_resolve_requires_owned_ready_scope_and_unambiguous_label():
    user, doc, other = ObjectId(), ObjectId(), ObjectId()
    db = Mock()
    rows = [{"_id": doc, "filename": "guide.pdf", "pages": 2}]
    db.documents.find.return_value.sort.return_value = rows
    label = sample(doc).label
    assert evaluation.resolve_cases(db, user, [doc], [label])[1][0].doc_id == doc
    assert db.documents.find.call_args.args[0] == {"_id": {"$in": [doc]}, "userId": user, "status": "ready"}
    with pytest.raises(ValueError, match="owned"):
        evaluation.resolve_cases(db, user, [doc, other], [label])
    rows.append({**rows[0], "_id": other})
    with pytest.raises(ValueError, match="ambiguous"):
        evaluation.resolve_cases(db, user, [doc, other], [label])


def test_baseline_calls_production_retriever_without_provider_credentials(tmp_path, monkeypatch, capsys):
    user, doc = ObjectId(), ObjectId()
    label = sample(doc).label
    path = tmp_path / "labels.json"
    path.write_text(json.dumps([label.model_dump()]), encoding="utf-8")
    client = MagicMock()
    db = client.__enter__.return_value.__getitem__.return_value
    db.documents.find.return_value.sort.return_value = [{"_id": doc, "filename": "guide.pdf", "pages": 2}]
    db.documents.distinct.return_value = [doc]
    db.chunks.list_search_indexes.return_value = [{"status": "READY", "queryable": True}]
    db.chunks.aggregate.return_value = [{"doc_id": str(doc), "chunk_id": str(ObjectId()), "filename": "guide.pdf",
                                         "page": 2, "text": "Opens at nine."}]
    config = SimpleNamespace(mongodb_uri=SecretStr("unused"), mongodb_db="main", vector_index="idx")
    models = Mock()
    models.embed.return_value = [[1.0] * 384]
    models.score.return_value = [0.9]
    monkeypatch.setattr(evaluation, "Connection", lambda: config)
    monkeypatch.setattr(evaluation, "MongoClient", lambda *a, **kw: client)
    monkeypatch.setattr(evaluation, "Models", lambda: models)
    monkeypatch.setattr(evaluation, "get_settings", lambda: pytest.fail("Unexpected provider access"))
    asyncio.run(evaluation.run(SimpleNamespace(questions=path, user_id=user, doc_ids=[doc], k=4,
                                               details=False, judge=False)))
    assert "| 1 | 4 | 1 | 1.0000 | 1.0000 | 1.0000 |" in capsys.readouterr().out
    search = db.chunks.aggregate.call_args.args[0][0]["$vectorSearch"]
    assert search["index"] == "idx" and search["filter"]["$and"] == [
        {"user_id": {"$eq": user}}, {"doc_id": {"$in": [doc]}}]


def test_rechunking_uses_real_page_text_and_production_window_at_default(tmp_path):
    text = " ".join("word" + str(i) for i in range(970))
    assert list(ablate.windows(text, offsets(text), 400, 60)) == [t for _, t in page_chunks([text], offsets)]
    assert [len(t.split()) for t in ablate.windows(text, offsets(text), 800, 60)] == [800, 230]
    path = tmp_path / "guide.pdf"
    with pymupdf.open() as pdf:
        pdf.new_page().insert_text((50, 50), "One two three four.")
        pdf.new_page().insert_text((50, 50), "Open at nine.")
        pdf.save(path)
    user, doc = ObjectId(), ObjectId()
    models, collection = Mock(), Mock()
    models.offsets.side_effect = offsets
    models.embed.side_effect = lambda texts: [[1.0] * 384 for _ in texts]
    rows = []
    collection.insert_many.side_effect = rows.extend
    counts = ablate.build_corpus(collection, models, user, [
        {"_id": doc, "filename": path.name, "sizeBytes": path.stat().st_size, "pages": 2}
    ], tmp_path, [(2, 1), (4, 0)])
    assert counts == {"2/1": 5, "4/0": 2}
    assert {r["page"] for r in rows} == {1, 2}
    assert all(r["user_id"] == user and r["doc_id"] == doc and len(r["embedding"]) == 384 for r in rows)


def test_ablation_uses_same_filtered_pool_for_both_rankings(capsys):
    user, doc, distractor = ObjectId(), ObjectId(), ObjectId()
    collection, models = Mock(), Mock()
    models.embed.return_value = [[1.0] * 384]
    models.score.return_value = [0.1, 0.8]
    collection.aggregate.return_value = [
        {"doc_id": distractor, "page": 2, "text": "Other"}, {"doc_id": doc, "page": 2, "text": "Library"}]
    ablate.compare(collection, models, user, [doc, distractor], [sample(doc)], [(400, 60)], [1, 4], {"400/60": 20})
    query = collection.aggregate.call_args.args[0][0]["$vectorSearch"]
    assert query["filter"]["$and"] == [{"user_id": {"$eq": user}}, {"doc_id": {"$in": [doc, distractor]}},
                                      {"variant": {"$eq": "400/60"}}]
    assert query["limit"] == 12
    collection.aggregate.assert_called_once()
    table = capsys.readouterr().out
    assert "| off | 1 | 1 | 0 | 0.0000 | 0.0000 | 0.5000 |" in table
    assert "| on | 1 | 1 | 1 | 1.0000 | 1.0000 | 1.0000 |" in table


def test_judge_sees_gold_after_answer_and_honors_abstention(monkeypatch):
    user, doc = ObjectId(), ObjectId()
    case = sample(doc)
    ask = Ask(user_id=str(user), doc_ids=[str(doc)], question=case.label.question)
    source = Source(chunk_id=str(ObjectId()), doc_id=str(doc), filename="guide.pdf", page=2,
                    text="It opens at nine.", score=0.9)
    db = Mock()
    db.chunks.find.return_value.sort.return_value = [{"text": "Gold page transcript"}]
    prompts = []

    async def provider(prompt):
        prompts.append(json.loads(prompt.user))
        yield '{"score":1}' if "reference_page" in prompts[-1] else "At nine [guide.pdf, p.2]."

    monkeypatch.setattr(evaluation, "generate_stream", provider)
    assert asyncio.run(evaluation.correctness(db, user, case, ask, [source], 0.5)) == 1
    assert set(prompts[0]) == {"context", "history", "question"}
    assert prompts[1]["reference_page"] == ["Gold page transcript"]
    assert prompts[1]["answer"].startswith("At nine")
    prompts.clear()
    asyncio.run(evaluation.correctness(db, user, case, ask, [], 0.5))
    assert len(prompts) == 1 and prompts[0]["answer"] == evaluation.ABSTENTION
