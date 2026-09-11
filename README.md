# ASCII City

An explorable ASCII city with nine neighborhoods, a river and waterfall, and a visitor yard across a bridge.

## Repository layout

```text
frontend/           React/Vinext app, renderer, assets, npm files, builds and tests
backend/            Python/FastAPI app, Chroma Cloud client, import tools, tests and Dockerfile
README.md           Setup and deployment
HOW_IT_WORKS.md     How the city and visitor yard work
```

The root also contains Git's hidden `.git/` and `.gitignore`. All application configuration, dependencies, generated output and supporting documents live inside the relevant app folder. Each service is installed and started independently.

## Run locally

Use Python 3.11+ and Node 22.13+.

**Backend — terminal 1**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Before starting the backend, copy `backend/.env.example` to `backend/.env` and fill in `CHROMA_API_KEY`, `CHROMA_TENANT`, and `CHROMA_DATABASE` from the Chroma Cloud dashboard. Choose a separate collection for local development so local experiments do not change production slates. Missing cloud settings stop startup; there is no temporary SQLite fallback.

On macOS/Linux, use `.venv/bin/python` instead of `.venv\Scripts\python.exe`.

**Frontend — terminal 2**

```sh
cd frontend
npm ci
npm run dev
```

Open the frontend URL printed by the server (normally http://localhost:3000). The frontend forwards `/api/visitors` to FastAPI on port 8000. Keep both processes running.

Choose **Visitor yard**, cross the bridge, and leave your name. Names are saved in Chroma Cloud and survive backend restarts and redeployments. Existing SQLite files and the original D1 backup remain local until explicitly imported; they are not read by the running API.

Local development has matching development-only secrets in both services. For customization, copy `backend/.env.example` to `backend/.env` and `frontend/.dev.vars.example` to `frontend/.dev.vars`. Both files are ignored by Git. `PUBLIC_ORIGIN` must match the browser's frontend origin.

## Checks

From `frontend/`:

```sh
npm test
npm run typecheck
npm run build
```

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
```

The frontend checks cover geometry, walking routes, cameras, full names and centered inscriptions. Backend tests inject a simulated Chroma collection to check new API instances sharing remote records, concurrency, moderation, rate limits, ambiguous write retries, cloud response batching and shared links. Import tests use temporary SQLite files. These are offline tests, not a live cloud integration check, and do not add fake names to your actual visitor yard.

## Deployment

Deploy the two folders as separate services.

- **Frontend:** set its project directory to `frontend/`, install with `npm ci`, and build with `npm run build`. The retained Sites/Cloudflare build configuration lives in `frontend/.openai/` and `frontend/vite.config.ts`. Output is `frontend/dist/`.
- **Backend on Render:** create a Python web service with root directory `backend`, build command `pip install -r requirements.txt`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --no-proxy-headers`, and health check `/health`. No persistent disk is needed. Alternatively build the Dockerfile with `backend/` as its context.
- **Database:** create/select a Chroma Cloud database and configure the following values in Render's **Environment** settings. The backend uses `chromadb.CloudClient` via the lightweight `chromadb-client` package. Names are metadata with a fixed placeholder vector; no embedding model or separate AI API is needed.

Configure these server-side environment values:

| Service | Variable | Purpose |
| --- | --- | --- |
| Frontend | `BACKEND_URL` | Reachable HTTPS URL of the Python service |
| Both | `BACKEND_PROXY_SECRET` | Same random secret, at least 32 characters |
| Backend | `ENVIRONMENT` | `production` |
| Backend | `PUBLIC_ORIGIN` | Exact HTTPS origin of the frontend |
| Backend | `VISITOR_SECRET` | Stable random secret, at least 32 characters |
| Backend | `VISITOR_ADMIN_TOKEN` | Separate random moderation token, at least 32 characters |
| Backend | `CHROMA_API_KEY` | Private Chroma Cloud API key; never put it in code |
| Backend | `CHROMA_TENANT` | Tenant identifier from the Chroma dashboard |
| Backend | `CHROMA_DATABASE` | Exact database name selected in Chroma Cloud |
| Backend | `CHROMA_COLLECTION` | `city_visitors_v1` by default; use a dedicated collection |
| Backend | `WEB_CONCURRENCY` | `1` |

The browser always calls its own frontend origin. The frontend authenticates requests to Python and forwards cookies; database code and credentials are never shipped to the browser. Direct requests to the Python visitor API require the proxy credential. `/health` reports database readiness without credentials.

Only variable names and blank credential placeholders are committed. Keep Chroma credentials and the tenant identifier in Render's environment (or ignored `backend/.env` for local use), never in frontend variables. This repository cannot configure Render's dashboard by itself.

Keep `VISITOR_SECRET` stable: changing it breaks recognition of existing browser cookies. When importing records, preserve the secret that created their visitor hashes. Do not reuse development-only fallback secrets in production.

**One active writer per collection is required.** A process lock protects slot allocation and the per-network quota; Chroma does not provide the SQL transaction previously used for these operations. Use one instance and one worker. Do not run local and production backends against the same collection. Render's rolling deployments can briefly overlap instances, so stop/suspend the old writer before deploying/resuming its replacement and turn off automatic deploys for this setup. Likewise, stop the API before importing. Multi-instance or overlapping writers require additional distributed coordination before enabling them.

Reads currently scan visitor metadata in batches of 300 to compute totals, find the highest assigned slot and enforce quotas. This is intended for a small visitor garden; read cost and latency grow with the record count. Cloud failures return a generic 503 without SDK request details. The old SQL migration is retained only as the documented legacy schema/import test fixture.

No build or test command deploys either service.

## Visitor records and moderation

Visitors leave a public name/nickname of up to 24 Unicode characters. An HTTP-only cookie provides a best-effort one-slate-per-browser rule. Clearing cookies or using another device can create a new visit. Names are validated, links are disallowed, and each network can save at most five new slates per clock hour. Quota evidence is stored with each slate, so restarts and hiding names do not reset it. Rate-limit identifiers are keyed hashes rather than stored IP addresses.

Each garden page has 48 assigned slots. Hiding a name preserves its slot and keeps all other stones in place. A full name is centered on the stone, wrapping when necessary. At distant zoom levels inscriptions naturally become small; click a slate to read it in the panel.

To hide or restore a slate, set `VISITOR_ADMIN_TOKEN` in `backend/.env` to the backend's configured token, then from `backend/` run:

```powershell
.\.venv\Scripts\python.exe scripts/moderate.py https://your-city.example slate-uuid hide
.\.venv\Scripts\python.exe scripts/moderate.py https://your-city.example slate-uuid restore
```

The slate ID is in its copied link. Hiding is reversible and prevents that browser from submitting a replacement.

To import the existing SQLite/D1 visitor records, stop all writers to the target Chroma collection, configure the cloud environment, and run from `backend/`:

```powershell
.\.venv\Scripts\python.exe scripts/import_sqlite.py data/visitors.sqlite3
```

This reads the source without modifying it and preserves IDs, dates, hidden status, visitor hashes and slot sequences. It refuses conflicts before adding anything, and can resume an interrupted import without overwriting already imported records. Old hourly attempt counters are not migrated. The old `import_d1.py` remains a local SQLite backup utility only. Keep database exports/backups outside Git.
