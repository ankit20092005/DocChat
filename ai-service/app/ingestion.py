import logging
from collections.abc import Callable, Iterator
from itertools import islice
from pathlib import Path
from threading import Lock

import pymupdf
from pymongo.database import Database

from .config import BATCH_SIZE, CHUNK_TOKENS, MAX_PAGES, OVERLAP
from .db import Job, Superseded, finish, write_batch
from .models import Models

log = logging.getLogger(__name__)
pdf_lock = Lock()


class InvalidPDF(ValueError):
    pass


def extract_pages(path: Path) -> list[str]:
    # PyMuPDF does not support concurrent calls in multiple threads.
    with pdf_lock:
        try:
            with pymupdf.open(path) as pdf:
                if not pdf.is_pdf:
                    raise InvalidPDF("Upload a PDF file.")
                if pdf.needs_pass:
                    raise InvalidPDF("Password-protected PDF. Upload an unlocked copy.")
                if len(pdf) > MAX_PAGES:
                    raise InvalidPDF(f"PDF exceeds the {MAX_PAGES}-page limit.")
                return [page.get_text("text", sort=True) for page in pdf]
        except (pymupdf.FileDataError, RuntimeError) as exc:
            raise InvalidPDF("The PDF is empty, damaged, or unreadable.") from exc


def page_chunks(
    pages: list[str], get_offsets: Callable[[str], list[tuple[int, int]]],
) -> Iterator[tuple[int, str]]:
    for page, text in enumerate(pages, start=1):
        offsets = get_offsets(text)
        for start in range(0, len(offsets), CHUNK_TOKENS - OVERLAP):
            end = min(start + CHUNK_TOKENS, len(offsets))
            # Slice the original so punctuation, casing, and whitespace survive.
            yield page, text[offsets[start][0]:offsets[end - 1][1]]
            if end == len(offsets):
                break


def ingest_pdf(path: Path, filename: str, db: Database, models: Models, job: Job):
    pages = []
    try:
        pages = extract_pages(path)
        chunks = page_chunks(pages, models.offsets)
        index = 0
        while batch := list(islice(chunks, BATCH_SIZE)):
            vectors = models.embed([text for _, text in batch])
            rows = []
            for (page, text), vector in zip(batch, vectors, strict=True):
                rows.append({
                    **job.chunks, "user_id": job.user_id, "doc_id": job.doc_id,
                    "filename": filename, "page": page, "chunkIndex": index,
                    "text": text, "embedding": vector,
                })
                index += 1
            write_batch(db, job, rows)
        if index == 0:
            raise InvalidPDF("scanned PDF, OCR not supported")
        finish(db, job, len(pages))
    except Superseded:
        log.info("Ingestion superseded doc_id=%s", job.doc_id)
    except Exception as exc:
        log.error("Ingestion failed doc_id=%s type=%s", job.doc_id, type(exc).__name__)
        error = str(exc) if isinstance(exc, InvalidPDF) else "Ingestion failed. Retry the upload."
        finish(db, job, len(pages), error)
    finally:
        path.unlink(missing_ok=True)
