# Deploy ASCII City: Vercel + Render

The frontend is a Next.js app in `frontend/`. FastAPI runs separately from `backend/`. Chroma Cloud stores visitor slates; no Render disk is needed.

```text
Browser → Vercel /api/visitors → Render FastAPI → Chroma Cloud
```

The Vercel API route is a small authenticated proxy. It forwards the visitor cookie and Vercel's client address. The browser never needs the Render URL or database credentials, and cross-origin browser requests are unnecessary.

## 1. Prepare

1. Push this configuration, including `frontend/package-lock.json` and root `render.yaml`, to your GitHub repository.
2. Create/select your Chroma Cloud database. Have its API key, tenant and database name ready. Preserve the existing production collection and `VISITOR_SECRET` if you already have visitor records.
3. For a new deployment, generate three independent secrets: `BACKEND_PROXY_SECRET`, `VISITOR_SECRET`, and `VISITOR_ADMIN_TOKEN`. Each must be at least 32 characters. For example, run this locally three times and save the results securely:

   ```sh
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

Only `BACKEND_PROXY_SECRET` is shared between services. Never put secrets into Git or a `NEXT_PUBLIC_*` variable.

## 2. Create the Vercel project first

Import the GitHub repository in Vercel, using:

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Next.js |
| Node.js | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Leave the framework default; do not set `dist` |

`frontend/vercel.json` specifies the framework and commands. The first deployment can run without backend variables: the city and guide work, while the visitor yard returns a temporary-unavailable message. This gives you the real production domain to use on Render.

Copy the stable production origin, for example `https://your-city.vercel.app`. Use your custom domain instead if that is the address visitors will use. Do not use a commit-specific preview URL or include a path.

## 3. Deploy the Render backend

In Render choose **New → Blueprint**, connect the same repository and select its root `render.yaml`.

The Blueprint configures a **paid 0.5 CPU / 512 MB web service**, one instance, one Uvicorn worker, Python 3.11.11, and automatic deployment disabled. Review the selected plan before creating the service; this repository does not purchase or deploy anything itself.

Supply the prompted values:

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | Exact Vercel production origin from step 2, without a trailing slash |
| `BACKEND_PROXY_SECRET` | Shared proxy secret from step 1 |
| `VISITOR_SECRET` | Stable visitor-cookie secret from step 1, or the existing production secret |
| `VISITOR_ADMIN_TOKEN` | Separate moderation secret |
| `CHROMA_API_KEY` | Chroma Cloud API key |
| `CHROMA_TENANT` | Chroma Cloud tenant ID |
| `CHROMA_DATABASE` | Exact Chroma Cloud database name |
| `CHROMA_COLLECTION` | `city_visitors_v1`, or your existing production collection |

The Blueprint also sets `ENVIRONMENT=production` and `WEB_CONCURRENCY=1`.

If configuring a web service manually, choose **Python 3**, Root Directory `backend`, Build Command `pip install -r requirements.txt`, Health Check Path `/health`, and Start Command:

```sh
uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --no-proxy-headers
```

Set all the environment values above plus `PYTHON_VERSION=3.11.11`, `ENVIRONMENT=production`, and `WEB_CONCURRENCY=1`. Disable automatic deploys and autoscaling.

After deployment, open `https://YOUR-SERVICE.onrender.com/health`. It must return `{"status":"ok"}`. A database connection or credentials failure must be fixed before continuing.

## 4. Connect Vercel to Render

In Vercel → Project Settings → Environment Variables, add these to **Production**:

| Variable | Value |
| --- | --- |
| `BACKEND_URL` | `https://YOUR-SERVICE.onrender.com` |
| `BACKEND_PROXY_SECRET` | Exactly the same secret as on Render |

Redeploy the Vercel production deployment to apply the variables. Do not use a static export: `/api/visitors` must execute server-side.

Leave these variables unset for Vercel Preview deployments unless you have a separate staging backend, collection and exact `PUBLIC_ORIGIN`. The production backend intentionally rejects writes from other origins. Do not disable that check to accommodate preview URLs.

## 5. Verify

- Load `/` and `/how-it-works` on the Vercel domain, including a direct refresh of the guide.
- Open Credits and return to the city.
- Open `/api/visitors?page=0` on the **Vercel** domain; it should return JSON rather than 503.
- Open Visitor Yard, add your name, then refresh. Confirm the slate persists and your browser recognises its visit. This step creates a real record; use staging if you do not want one in production.
- Calling Render's `/api/visitors` directly without the proxy secret should return 403. This is expected.

## Updates and the single-writer constraint

Frontend deployments can run normally. Backend deployments need care: Chroma slot allocation uses a process-local lock. **Only one backend process may write to a collection at a time**, including during deployments and imports. One worker and one instance alone do not prevent Render's rolling deployment overlap.

For backend updates, enable Render maintenance mode to block incoming traffic, let in-flight visitor requests finish, deploy manually, wait for completion and the old instance to stop, then disable maintenance mode. Keep import scripts and other backends stopped during this process. Alternatively, stop the old service before starting its replacement. Brief visitor-yard downtime is preferable to overlapping writers. Do not enable auto-deploys or use the production collection in local development.

Keep `VISITOR_SECRET` stable across updates. Rotating it prevents existing visitor cookies from being recognised. A domain change also changes the browser's cookie scope; update `PUBLIC_ORIGIN` to the new canonical domain before accepting writes there.

## Local development after this change

The frontend now reads Next.js environment files, **not** Wrangler `.dev.vars`:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Run FastAPI independently as described in the README. The localhost development proxy fallback still matches the backend's development secret. For a production-mode local smoke test (`npm run build` / `npm start`), explicitly configure valid server variables; production mode has no fallback credentials and requires an HTTPS backend.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Vercel cannot find the app | Root Directory must be `frontend`, not the repository root |
| Render cannot import `app` | Root Directory must be `backend` |
| Yard returns 503 | Render `/health`, Vercel server variables, HTTPS backend URL, Chroma settings |
| Yard writes return 403 | Matching proxy secrets and exact `PUBLIC_ORIGIN` |
| Local changes to `.dev.vars` do nothing | Copy values to ignored `frontend/.env.local` and restart Next.js |
| All visitors share a rate limit | Deploy directly on Vercel; the proxy uses its ingress IP header, not Cloudflare headers |

The old `frontend/.openai/hosting.json` is historical Sites metadata and is not used by this deployment. No deployment requires Sites or Cloudflare credentials.

Official references: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel request headers](https://vercel.com/docs/headers/request-headers), [FastAPI on Render](https://render.com/docs/deploy-fastapi), [Render Blueprints](https://render.com/docs/blueprint-spec), [Render deploys](https://render.com/docs/deploys).
