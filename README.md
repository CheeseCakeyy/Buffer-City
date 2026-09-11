# ASCII City

An explorable ASCII city with nine neighborhoods, a river and waterfall, and a visitor yard across a bridge.

## Repository layout

```text
frontend/           React/Vinext app, renderer, assets, npm files, builds and tests
backend/            Python/FastAPI app, SQLite database, migrations, tests and Dockerfile
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

On macOS/Linux, use `.venv/bin/python` instead of `.venv\Scripts\python.exe`.

**Frontend — terminal 2**

```sh
cd frontend
npm ci
npm run dev
```

Open the frontend URL printed by the server (normally http://localhost:3000). The frontend forwards `/api/visitors` to FastAPI on port 8000. Keep both processes running.

Choose **Visitor yard**, cross the bridge, and leave your name. Names are saved in `backend/data/visitors.sqlite3`, which survives restarts. Existing migrated visitor IDs, dates, positions, and share links are preserved. A read-only source backup remains in `backend/data/legacy-wrangler/`.

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

The frontend checks cover geometry, walking routes, cameras, full names and centered inscriptions. Backend tests use temporary SQLite databases to check persistence, concurrency, moderation, rate limits, migration compatibility and shared links. They do not add fake names to your actual visitor yard.

## Deployment

Deploy the two folders as separate services.

- **Frontend:** set its project directory to `frontend/`, install with `npm ci`, and build with `npm run build`. The retained Sites/Cloudflare build configuration lives in `frontend/.openai/` and `frontend/vite.config.ts`. Output is `frontend/dist/`.
- **Backend:** use a Python host or build the Dockerfile with `backend/` as the build context. Run `uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers`. The backend runs separately from the frontend's Worker.
- **Database:** mount a persistent volume at `/app/data` for Docker, or set `DATABASE_PATH` to a persistent path on your Python host. SQLite supports this single-instance service; do not put independent backend replicas on separate database files. Back up the database before deployment changes.

Configure these server-side environment values:

| Service | Variable | Purpose |
| --- | --- | --- |
| Frontend | `BACKEND_URL` | Reachable HTTPS URL of the Python service |
| Both | `BACKEND_PROXY_SECRET` | Same random secret, at least 32 characters |
| Backend | `ENVIRONMENT` | `production` |
| Backend | `PUBLIC_ORIGIN` | Exact HTTPS origin of the frontend |
| Backend | `VISITOR_SECRET` | Stable random secret, at least 32 characters |
| Backend | `VISITOR_ADMIN_TOKEN` | Separate random moderation token, at least 32 characters |
| Backend | `DATABASE_PATH` | Persistent SQLite file location |

The browser always calls its own frontend origin. The frontend authenticates requests to Python and forwards cookies; database code and credentials are never shipped to the browser. Direct requests to the Python visitor API require the proxy credential. `/health` reports database readiness without credentials.

Keep `VISITOR_SECRET` stable: changing it breaks recognition of existing browser cookies. When moving existing data to a production host, preserve both the database and the secret that created its visitor hashes. Do not reuse development-only fallback secrets in production.

SQLite migrations in `backend/migrations/*.sql` run transactionally during backend startup. Applied migrations are recorded in `schema_migrations`. Add new migrations rather than rewriting applied files.

No build or test command deploys either service.

## Visitor records and moderation

Visitors leave a public name/nickname of up to 24 Unicode characters. An HTTP-only cookie provides a best-effort one-slate-per-browser rule. Clearing cookies or using another device can create a new visit. Names are validated, links are disallowed, and each network can make at most five new submission attempts per hour. Rate-limit identifiers are keyed hashes rather than stored IP addresses.

Each garden page has 48 assigned slots. Hiding a name preserves its slot and keeps all other stones in place. A full name is centered on the stone, wrapping when necessary. At distant zoom levels inscriptions naturally become small; click a slate to read it in the panel.

To hide or restore a slate, set `VISITOR_ADMIN_TOKEN` in `backend/.env` to the backend's configured token, then from `backend/` run:

```powershell
.\.venv\Scripts\python.exe scripts/moderate.py https://your-city.example slate-uuid hide
.\.venv\Scripts\python.exe scripts/moderate.py https://your-city.example slate-uuid restore
```

The slate ID is in its copied link. Hiding is reversible and prevents that browser from submitting a replacement.

For another local D1-to-Python import, stop writes and use `backend/scripts/import_d1.py` with the source SQLite path. The script uses SQLite's backup API, preserves the source, and refuses to overwrite an existing target.
