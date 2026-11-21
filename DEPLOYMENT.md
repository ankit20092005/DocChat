# Deploy DocChat on Vercel, Render and MongoDB Atlas

Vercel serves the static client. The browser posts PDFs and chat messages directly to a public Express web service on Render. Express calls a private FastAPI service in the same Render region. Use a stable frontend origin for each environment.

## 1. Prepare Atlas

1. Create a cluster that supports Atlas Vector Search and transactions. Choose a region near the Render services and create the `docchat` database and `chunks` collection in Data Explorer. Create a database user with `readWrite` on `docchat` and copy its driver connection string. Percent-encode special characters in the credentials. [Atlas connection guide](https://www.mongodb.com/docs/atlas/connect-to-cluster/)
2. Add your development machine’s public IP to the project IP access list. When you create the Render services, open each service’s **Connect → Outbound** tab and add its listed CIDR ranges to Atlas. Both services open database connections. [Render outbound addresses](https://render.com/docs/outbound-ip-addresses) · [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
3. In **Search & Vector Search**, create a **Vector Search** index on `docchat.chunks`. Choose the **JSON Editor**, paste the supplied definition, and name the index `chunk_embeddings`. Wait for it to become queryable. It indexes `embedding` with 384 dimensions and cosine similarity. The `user_id` and `doc_id` filters contain BSON ObjectIds. [Index definition](ai-service/atlas-vector-index.json) · [Atlas index instructions](https://www.mongodb.com/docs/vector-search/indexes/vector-search-type/)

## 2. Deploy private FastAPI

1. In Render, create a **Private Service** from the project repository. Select Docker, set the root directory to `ai-service`, and use `./Dockerfile` with build context `.`. Pick the workspace and region where Express will run. [Render Docker](https://render.com/docs/docker) · [Monorepo directories](https://render.com/docs/monorepo-support)
2. Set `PORT=8000` and the FastAPI variables in the checklist below. Use a generated internal key shared only with Express. Choose an instance with enough RAM for both models, inference batches and PDF extraction. Start with a measured workload and inspect peak memory during a long PDF upload.
3. Deploy. The build downloads the CPU libraries and both models. Runtime loads them from the image with one Uvicorn worker. Copy the service’s **internal hostname and port** from Connect. Add its outbound ranges to Atlas and redeploy if the first startup preceded the allowlist change. [Render private services](https://render.com/docs/private-services)

## 3. Deploy public Express

1. Create a **Web Service** from the same repo using Docker, root directory `server`, Dockerfile `./Dockerfile` and context `.`. Choose the same workspace and region. Set the health check path to `/health`. The process listens on `PORT`. Render terminates public HTTPS. [Web services](https://render.com/docs/web-services) · [Health checks](https://render.com/docs/health-checks)
2. Set the Express variables below. For `AI_URL`, enter `http://` followed by the private hostname and `:8000`. Enter your canonical Vercel origin for `CLIENT_URL`. Use a separately generated JWT secret. Add this service’s outbound ranges to Atlas. [Private networking](https://render.com/docs/private-network)
3. Deploy and save the public HTTPS origin, such as `https://docchat-api-example.onrender.com`. Open its `/health` path and confirm `{"status":"ok"}`. This checks HTTP availability. The upload and chat checks below also exercise the private service and Atlas index.

## 4. Deploy the static client

1. Import the repository into Vercel with **Root Directory** set to `client`. Select the **Vite** preset, Node 22.x, install command `npm ci`, build command `npm run build` and output directory `dist`. The supplied rewrites serve React Router deep links. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) · [SPA rewrites](client/vercel.json)
2. Set the public build variable `VITE_API_URL` to the Render Express HTTPS origin ending in `/api`. Deploy. After assigning the production domain, set Render’s `CLIENT_URL` to the exact browser origin, including the scheme. Redeploy the affected service after each change. Changing `VITE_API_URL` requires a fresh frontend build. [Vite environment variables](https://vite.dev/guide/env-and-mode)
3. **Keep the upload route on Express.** Vercel Functions have a 4.5 MB request-body limit. The repository deploys a static frontend to Vercel, and both multipart uploads and POST SSE travel directly between the browser and Render. [Vercel Functions limits](https://vercel.com/docs/functions/limitations)

## Environment checklist

| Service | Variables | Deployment value |
|---|---|---|
| Client | `VITE_API_URL` | Public HTTPS Express endpoint ending in `/api`. Everything with the Vite prefix is public. |
| Both backends | `MONGODB_URI`, `MONGODB_DB` | Atlas driver URI and identical database name, normally `docchat`. |
| Both backends | `INTERNAL_KEY` | Same random service secret on both sides of `X-Internal-Key`. |
| Express | `JWT_SECRET` | Independent random secret of at least 32 characters. |
| Express | `PORT`, `CLIENT_URL`, `AI_URL` | Platform port or 5000, exact Vercel origin, private FastAPI origin. |
| Express | `AI_TIMEOUT_MS`, `TRUST_PROXY_HOPS` | Example timeout 120000. Direct local connections use 0 trusted hops. For a verified single trusted reverse proxy use 1. Match the shortest supported ingress path so IP-based limits identify the client. [Express proxy configuration](https://expressjs.com/en/guide/behind-proxies/) |
| FastAPI | `PORT`, `VECTOR_INDEX`, `RERANK_THRESHOLD` | 8000, `chunk_embeddings`, and the validated sigmoid score cutoff, initially 0.50. |
| FastAPI | `LLM_PROVIDER`, `LLM_TIMEOUT_SECONDS` | `groq` or `gemini`, and a provider deadline shorter than the Express deadline. The example uses 60 seconds. |
| FastAPI | `GROQ_API_KEY`, `GROQ_MODEL` or `GEMINI_API_KEY`, `GEMINI_MODEL` | Supply the selected provider’s key and an enabled model ID for your account. |

The service templates contain the complete starting configurations. Use host-managed secrets in deployment. [Client](client/.env.example) · [Express](server/.env.example) · [FastAPI](ai-service/.env.example)

Express allows the single configured origin and accepts the `Authorization` and `Content-Type` request headers. A generated Vercel preview URL has its own origin. For a shared preview, point a stable staging domain to a staging client build and configure its API with that exact origin.

## Capacity and acceptance checks

- Render’s free web service has 512 MB of RAM and spins down after 15 idle minutes. A cold request can take about a minute to wake it. Private services require paid compute. Size the AI instance using peak RSS for startup and a representative upload. Multiple worker processes each load a model pair. [Render compute plans](https://render.com/docs/compute-plans) · [Free-tier limits](https://render.com/docs/free)
- The image build needs network access, disk and time for CPU PyTorch and model weights. The model cache ships inside the image. Uploaded PDFs occupy temporary disk during ingestion, and background jobs can be interrupted by a restart. Check provider request/token quotas and Atlas storage and index allowances for both the app and the ablation. [Atlas free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) · [Groq limits](https://console.groq.com/docs/rate-limits) · [Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Sign up, upload a searchable PDF with a known fact on page 2, wait for `ready`, then ask for that fact. Check that tokens appear incrementally, the citation opens page 2’s excerpt, and the completed answer survives a refresh. Atlas indexing can briefly lag the document’s ready status.
- Test an exactly 50 MiB PDF with at most 500 pages through the actual public URL. Multipart framing makes the request larger than the file. The local Nginx container serves static files with a 50M body limit. Direct browser-to-Express uploads avoid that proxy boundary. Check any additional ingress proxy’s request-body ceiling, buffering and idle timeout with a large upload and a slow streamed answer. [Nginx body-size directive](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size)
- Refresh a deep link under `/workspace/`. Stop an answer midstream and confirm that the partial response is absent from history. Test a second account with a separate PDF to verify ownership boundaries in the deployed environment.
