# DocChat Express API

## Integration assumptions

- Express and FastAPI share `MONGODB_URI`, `MONGODB_DB` and `INTERNAL_KEY`. Use an Atlas deployment that supports transactions. Express uses transactions for quota reservations, message writes and cascading deletion. [Mongoose transactions](https://mongoosejs.com/docs/transactions.html)
- Registration accepts a password of at least eight characters and at most 72 UTF-8 bytes. Registration and login return `{ token, user }`. The token expires after 15 minutes. `/api/auth/me`, uploads, and conversation creates and updates return the resource directly. Lists return arrays and deletes return HTTP 204. Resource IDs use `_id`.
- The 10-document and 200 MiB quotas include processing, ready and failed uploads. A file may be exactly 50 MiB. FastAPI checks the 500-page limit during background ingestion. Poll the document after HTTP 202. Delete a failed upload to reclaim its quota.
- Conversations accept an empty document selection. Chat requires at least one ready document owned by the caller. One answer streams per conversation at a time. History contains the four messages immediately preceding the new question, in chronological order.
- A submitted question stays in history when generation fails or the client disconnects. Express commits the assistant message before forwarding a successful `done`. FastAPI's `done.ok: false` passes through unchanged. A truncated upstream stream closes the HTTP response without a successful terminal event.
- Errors before streaming use `{ "error": { "code": "CODE", "message": "Message" } }`. Rate limits use a 15-minute window per server process. The general limit is 300 requests per IP, login allows 10 per IP, upload allows 20 per user, and chat allows 30 per user. `TRUST_PROXY_HOPS` defaults to 0 for direct connections.

## Install and run

Use Node.js 22.17 or later. From the project root in PowerShell, install the locked dependencies and create the local environment file.

```powershell
Set-Location server
npm.cmd ci
if (!(Test-Path .env)) {
    $jwt = node -p "require('node:crypto').randomBytes(32).toString('hex')"
    (Get-Content .env.example) -replace '^JWT_SECRET=$', "JWT_SECRET=$jwt" | Set-Content -Encoding ascii .env
}
```

Set `MONGODB_URI` and `INTERNAL_KEY` in `.env`. Match `MONGODB_DB` to FastAPI, `AI_URL` to its address, and `CLIENT_URL` to the React origin. Start FastAPI using `../ai-service/README.md`. From `server`, start Express.

```powershell
npm.cmd start
```

## Automated tests

```powershell
npm.cmd test
```

The tests launch an isolated MongoDB replica set and a local HTTP fixture for FastAPI. The first run downloads a MongoDB test binary. The suite exercises ownership, exact size boundaries, concurrent quota reservations, streaming, history, cancellation, and cleanup.

## Curl examples for every route

Open a second PowerShell in `server`. These commands create a disposable account and a valid one-page PDF, then remove the demonstration documents and conversation. The PDF generation command uses the existing FastAPI virtual environment.

```powershell
$base = 'http://127.0.0.1:4000'
$email = "demo-$([guid]::NewGuid())@example.org"
$password = node -p "require('node:crypto').randomBytes(24).toString('hex')"
$credentials = @{ email = $email; password = $password } | ConvertTo-Json -Compress

# GET /health
curl.exe -fsS "$base/health"

# POST /api/auth/register
$credentials | curl.exe -fsS -H 'Content-Type: application/json' --data-binary '@-' "$base/api/auth/register" | Out-Null

# POST /api/auth/login
$session = $credentials | curl.exe -fsS -H 'Content-Type: application/json' --data-binary '@-' "$base/api/auth/login" | ConvertFrom-Json
$auth = "Authorization: Bearer $($session.token)"

# GET /api/auth/me
curl.exe -fsS -H $auth "$base/api/auth/me"

# POST /api/documents
$pdf = Join-Path $env:TEMP "docchat-demo-$([guid]::NewGuid()).pdf"
& ..\ai-service\.venv\Scripts\python.exe -c "import pymupdf,sys; d=pymupdf.open(); d.new_page().insert_text((72,72),'Refund payments are due within thirty days of purchase.'); d.save(sys.argv[1]); d.close()" $pdf
$doc = curl.exe -fsS -H $auth -F "file=@$pdf;filename=returns.pdf;type=application/pdf" "$base/api/documents" | ConvertFrom-Json
$docUrl = "$base/api/documents/$($doc._id)"

# GET /api/documents
curl.exe -fsS -H $auth "$base/api/documents"

# GET /api/documents/:id
$deadline = (Get-Date).AddMinutes(5)
do {
    $doc = curl.exe -fsS -H $auth "$docUrl" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Document lookup failed.' }
    if ($doc.status -eq 'failed') { throw $doc.error }
    if ($doc.status -eq 'ready') { break }
    if ((Get-Date) -ge $deadline) { throw 'Document is still processing.' }
    Start-Sleep -Seconds 1
} while ($true)

# POST /api/conversations
$new = @{ title = 'Refund policy'; docIds = @($doc._id) } | ConvertTo-Json -Compress
$chat = $new | curl.exe -fsS -H $auth -H 'Content-Type: application/json' --data-binary '@-' "$base/api/conversations" | ConvertFrom-Json
$chatUrl = "$base/api/conversations/$($chat._id)"

# GET /api/conversations
curl.exe -fsS -H $auth "$base/api/conversations"

# PATCH /api/conversations/:id
'{"title":"Returns"}' | curl.exe -fsS -X PATCH -H $auth -H 'Content-Type: application/json' --data-binary '@-' "$chatUrl"

# POST /api/conversations/:id/messages
'{"content":"When are refund payments due?"}' | curl.exe -fsS -N -H $auth -H 'Content-Type: application/json' --data-binary '@-' "$chatUrl/messages"

# GET /api/conversations/:id/messages
curl.exe -fsS -H $auth "$chatUrl/messages"

# DELETE /api/conversations/:id
curl.exe -fsS -i -X DELETE -H $auth "$chatUrl"

# DELETE /api/documents/:id
curl.exe -fsS -i -X DELETE -H $auth "$docUrl"
```

Once Atlas has indexed the sample, the answer should cite `[returns.pdf, p.1]`. The message history should contain the same answer and the sources received over SSE.

## Checklist

- [x] Four Mongoose models and all requested HTTP routes
- [x] bcrypt, expiring bearer tokens, validation, and owner-scoped access
- [x] Disk uploads, PDF signature checks, atomic quotas, forwarding, and cleanup
- [x] Ready-document selection, four-message history, byte-preserving SSE, and disconnect cancellation
- [x] Helmet, restricted CORS, route-specific rate limits, and consistent JSON errors
- [x] Environment template, locked dependencies, integration tests, and curl examples
