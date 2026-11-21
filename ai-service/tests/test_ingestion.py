from unittest.mock import MagicMock, Mock

import pymupdf
import pytest
from bson import ObjectId
from tokenizers import Tokenizer
from tokenizers.models import WordPiece
from tokenizers.pre_tokenizers import BertPreTokenizer

from app import ingestion
from app.db import Job, Superseded, delete_document, finish, write_batch


@pytest.fixture
def offsets():
    tokenizer = Tokenizer(WordPiece({"[UNK]": 0, "play": 1, "##ing": 2}))
    tokenizer.pre_tokenizer = BertPreTokenizer()
    return lambda text: tokenizer.encode(text).offsets


@pytest.mark.parametrize(("words", "lengths"), [(200, [200]), (201, [200, 31]), (370, [200, 200])])
def test_wordpiece_windows_are_page_local(offsets, words, lengths):
    # Each "playing" is two tokens. Sixty overlapping tokens are thirty words.
    page = " ".join(["playing"] * words)
    chunks = list(ingestion.page_chunks(["", page, "Next,\npage!"], offsets))
    assert chunks[:-1] == [(2, " ".join(["playing"] * n)) for n in lengths]
    assert chunks[-1] == (3, "Next,\npage!")


@pytest.mark.parametrize("pages", [1, 33, 501])
def test_pdf_background_job(tmp_path, monkeypatch, offsets, pages):
    path = tmp_path / "sample.pdf"
    with pymupdf.open() as pdf:
        for _ in range(pages):
            page = pdf.new_page()
            if pages == 33:
                page.insert_text((72, 72), "Refunds take thirty days.")
        pdf.save(path)
    job = Job(ObjectId(), ObjectId())
    db, models, write, finish = Mock(), Mock(), Mock(), Mock()
    models.offsets.side_effect = offsets
    models.embed.side_effect = lambda texts: [[0.0] * 384 for _ in texts]
    monkeypatch.setattr(ingestion, "write_batch", write)
    monkeypatch.setattr(ingestion, "finish", finish)
    ingestion.ingest_pdf(path, "sample.pdf", db, models, job)
    assert not path.exists()
    if pages == 33:
        batches = [call.args[2] for call in write.call_args_list]
        assert [len(batch) for batch in batches] == [32, 1]
        rows = batches[0] + batches[1]
        assert [r["chunkIndex"] for r in rows] == list(range(33))
        assert [r["page"] for r in rows] == list(range(1, 34))
        assert all(r["user_id"] == r["userId"] == job.user_id for r in rows)
        assert all(r["doc_id"] == r["docId"] == job.doc_id for r in rows)
        finish.assert_called_once_with(db, job, 33)
    else:
        write.assert_not_called()
        error = "scanned PDF, OCR not supported" if pages == 1 else "PDF exceeds the 500-page limit."
        finish.assert_called_once_with(db, job, 1 if pages == 1 else 0, error)


def test_a_stale_job_cannot_write_or_remove_another_attempt():
    db = MagicMock()
    job = Job(ObjectId(), ObjectId())
    session = db.client.start_session.return_value.__enter__.return_value
    session.with_transaction.side_effect = lambda operation: operation(session)
    db.documents.update_one.return_value.matched_count = 0
    with pytest.raises(Superseded):
        write_batch(db, job, [{"chunkIndex": 0}])
    finish(db, job, 0, "Superseded")
    for call in db.documents.update_one.call_args_list:
        assert call.args[0] == {"_id": job.doc_id, "userId": job.user_id, "ingestId": job.attempt}
    db.documents.delete_one.return_value.deleted_count = 0
    other_user = ObjectId()
    assert not delete_document(db, job.doc_id, other_user)
    db.documents.delete_one.assert_called_once_with({"_id": job.doc_id, "userId": other_user}, session=session)
    db.chunks.insert_many.assert_not_called()
    db.chunks.delete_many.assert_not_called()
