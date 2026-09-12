# ASCII City

An explorable ASCII city with nine neighborhoods, a river and waterfall, and a visitor yard across a bridge.

## Repository layout

```text
frontend/           React/Next.js app, renderer, assets, npm files, builds and tests
backend/            Python/FastAPI app, Chroma Cloud client, import tools, tests and Dockerfile
README.md           Setup and deployment
HOW_IT_WORKS.md     How the city and visitor yard work
```

The root also contains Git's hidden `.git/` and `.gitignore`. All application configuration, dependencies, generated output and supporting documents live inside the relevant app folder. Each service is installed and started independently.

## Run locally

Use Python 3.11 and Node 22.x.

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

Local development has matching development-only secrets in both services. For customization, copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Both files are ignored by Git. `PUBLIC_ORIGIN` must match the browser's frontend origin.

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

The frontend is configured for **Vercel** and the FastAPI backend for **Render**.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete setup, environment-variable tables, deployment order and verification steps.

- Vercel: root directory `frontend`, Next.js preset, `npm ci`, `npm run build`, framework-default output directory.
- Render: import the root `render.yaml` Blueprint. It uses the `backend` directory, one Python worker, one instance and the `/health` check. The configured compute plan is paid; review it before creating the service.
- The browser calls Vercel's `/api/visitors`; only that server-side proxy knows the backend URL and shared secret.
- Existing Chroma Cloud slates remain in the same collection. Preserve the production visitor secret and never run two writers against that collection, including during rolling backend deployments.

No build or test command deploys either service. Cloudflare bindings and Wrangler are no longer required; frontend configuration now lives in `.env.local` locally or Vercel's server-side environment variables.

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
