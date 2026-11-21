import logging
from contextlib import asynccontextmanager
from hmac import compare_digest
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Annotated

from bson import ObjectId
from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from .config import MAX_UPLOAD_BYTES, get_settings
from .db import Job, claim, delete_document
from .ingestion import ingest_pdf
from .models import Models
from .retrieval import answer_events, retrieve
from .schemas import Ask, Id

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    with MongoClient(settings.mongodb_uri.get_secret_value(), serverSelectionTimeoutMS=8000) as client:
        db = client[settings.mongodb_db]
        db.chunks.create_index([("userId", 1), ("docId", 1), ("chunkIndex", 1)], unique=True)
        app.state.db = db
        app.state.models = Models()
        app.state.settings = settings
        yield


class InternalAccess:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or scope["path"] == "/health":
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        expected = scope["app"].state.settings.internal_key.get_secret_value().encode()
        actual = headers.get("X-Internal-Key", "").encode()
        if not compare_digest(expected, actual):
            return await JSONResponse({"detail": "Invalid internal key."}, 401)(scope, receive, send)
        if scope["path"] != "/ingest":
            return await self.app(scope, receive, send)

        # Bound multipart spooling even when Express uses chunked transfer.
        limit = MAX_UPLOAD_BYTES + 64 * 1024
        length = headers.get("content-length")
        if length is not None and (not length.isascii() or not length.isdecimal() or len(length) > 20):
            return await JSONResponse({"detail": "Invalid Content-Length."}, 400)(scope, receive, send)
        if length is not None and int(length) > limit:
            return await JSONResponse({"detail": "PDF exceeds 50 MiB."}, 413)(scope, receive, send)
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > limit:
                raise HTTPException(413, "PDF exceeds 50 MiB.")
            return message

        await self.app(scope, limited_receive, send)


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(InternalAccess)


@app.exception_handler(PyMongoError)
async def database_error(request: Request, exc: PyMongoError):
    log.error("Database operation failed path=%s type=%s", request.url.path, type(exc).__name__)
    return JSONResponse({"detail": "Document database unavailable."}, status_code=503)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ingest", status_code=202)
def ingest(request: Request, tasks: BackgroundTasks, file: UploadFile,
           doc_id: Annotated[Id, Form()], user_id: Annotated[Id, Form()]):
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "PDF exceeds 50 MiB.")
    state = request.app.state
    job = Job(ObjectId(doc_id), ObjectId(user_id))
    path = None
    handed_off = False
    try:
        # UploadFile belongs to the request. The background worker owns this copy.
        with NamedTemporaryFile(prefix="docchat-", suffix=".pdf", delete=False) as temp:
            path = Path(temp.name)
            while block := file.file.read(1024 * 1024):
                if temp.tell() + len(block) > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "PDF exceeds 50 MiB.")
                temp.write(block)
            size = temp.tell()
        record = claim(state.db, job, size)
        if record is None:
            raise HTTPException(404, "Document not found.")
        tasks.add_task(ingest_pdf, path, record["filename"], state.db, state.models, job)
        handed_off = True
        return {"doc_id": doc_id, "status": "processing"}
    finally:
        if path is not None and not handed_off:
            path.unlink(missing_ok=True)


@app.post("/ask")
def ask(body: Ask, request: Request):
    state = request.app.state
    sources = retrieve(state.db, state.models, state.settings.vector_index, body)
    return StreamingResponse(
        answer_events(body, sources, state.settings.rerank_threshold),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@app.delete("/documents/{doc_id}", status_code=204)
def delete(doc_id: Id, user_id: Id, request: Request) -> Response:
    if not delete_document(request.app.state.db, ObjectId(doc_id), ObjectId(user_id)):
        raise HTTPException(404, "Document not found.")
    return Response(status_code=204)
