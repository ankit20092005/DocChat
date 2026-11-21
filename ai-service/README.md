# DocChat AI service

## Integration assumptions

- Express creates the document first with a BSON ObjectId for both `_id` and `userId`, the display filename, and status `processing`. Send those IDs as 24-character hex strings. An accepted retry for the same document supersedes the earlier job. After an interrupted service process, Express can resubmit the PDF.
- Chunk rows retain Mongoose's `userId` and `docId`. Matching BSON ObjectIds in `user_id` and `doc_id` support Atlas prefiltering. Physical PDF pages start at 1 and document-wide chunk indexes start at 0. The file limit is 50 MiB.
- Each history entry is one turn with `role` and `content`. The prompt uses the latest four entries. The threshold applies to the sigmoid of the cross-encoder score.
- SSE `token` data is plain text. Parse `sources` and `done` as JSON. Persist an answer when `done.ok` is true. On a provider failure, `done.error` describes the failure and the source list is empty.
- `DELETE /documents/{doc_id}?user_id={user_id}` removes the owned document and its chunks in one transaction. Express retains ownership of conversations and messages.

## Atlas index

In Atlas, open **Search & Vector Search** for your cluster. Choose **Create Search Index**, **Vector Search**, and **JSON Editor**. Select `docchat.chunks`, name the index `chunk_embeddings`, paste the contents of `atlas-vector-index.json`, and create the index. Wait until it is queryable. The service creates the collection on first startup. If you change the database or index name, update `.env` to match. [MongoDB index instructions](https://www.mongodb.com/docs/vector-search/indexes/vector-search-type/?deployment-type=atlas&embedding=byo&interface=atlas-ui)

## Install and run

From the repository root in PowerShell, use Python 3.11.

```powershell
Set-Location ai-service
if (!(Test-Path .venv\Scripts\python.exe)) { py -3.11 -m venv .venv }
$python = '.\.venv\Scripts\python.exe'
& $python -m pip install -r requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
& $python -m pytest -q
```

Set `MONGODB_URI`, `INTERNAL_KEY`, and the selected provider's API key in `.env`. Configure Express with the same internal key. `LLM_PROVIDER` accepts `groq` or `gemini`. Both model IDs can be changed in `.env`. [Groq free-tier models](https://console.groq.com/docs/rate-limits) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

```powershell
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

## Test with curl

Open a second PowerShell in `ai-service`. This fixture creates a one-page PDF and its matching document row in the configured database.

```powershell
$python = '.\.venv\Scripts\python.exe'
$base = 'http://127.0.0.1:8000'
$key = & $python -c "from app.config import get_settings; print(get_settings().internal_key.get_secret_value())"
curl.exe -fsS "$base/health"

$sample = @'
import json
import tempfile
from pathlib import Path
import pymupdf
from bson import ObjectId
from pymongo import MongoClient
from app.config import get_settings

s = get_settings()
user, doc = ObjectId(), ObjectId()
path = Path(tempfile.gettempdir()) / f"docchat-demo-{doc}.pdf"
with pymupdf.open() as pdf:
    pdf.new_page().insert_text((72, 72), "Refund payments are due within thirty days of purchase.")
    pdf.save(path)
with MongoClient(s.mongodb_uri.get_secret_value()) as client:
    client[s.mongodb_db].documents.insert_one({
        "_id": doc, "userId": user, "filename": "returns.pdf", "sizeBytes": path.stat().st_size,
        "pages": 0, "status": "processing", "error": None,
    })
print(json.dumps({"user": str(user), "doc": str(doc), "path": str(path)}))
'@ | & $python - | ConvertFrom-Json

curl.exe -sS -i -H "X-Internal-Key: $key" -F "doc_id=$($sample.doc)" -F "user_id=$($sample.user)" -F "file=@$($sample.path);type=application/pdf" "$base/ingest"
```

Ingest returns HTTP 202. Once the document is `ready` and Atlas has indexed its chunks, run the question. An answer to this fixture should cite `[returns.pdf, p.1]`.

```powershell
$body = @{
    user_id = $sample.user
    doc_ids = @($sample.doc)
    question = 'When are refund payments due?'
    history = @()
} | ConvertTo-Json -Compress
$body | curl.exe -fsS -N -H "X-Internal-Key: $key" -H "Content-Type: application/json" --data-binary '@-' "$base/ask"
```

## Checklist

- [x] Internal-key protection, PDF size and page limits, background status updates, and temporary-file cleanup
- [x] Startup model loading, page-local chunking, and batched embedding and insertion
- [x] Tenant-filtered Atlas top 12, cross-encoder top 4, and low-score abstention
- [x] Groq and Gemini streaming, source metadata, and terminal error reporting
- [x] Owner-scoped deletion, Atlas index JSON, and offline pytest coverage
