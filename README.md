# ASCII City

An explorable ASCII city with a river, waterfall, and visitor yard across a pedestrian bridge.

## Project layout

```text
frontend/
  app/                 Page, styles, layout, and a thin API route adapter
  components/          Visitor yard panel and existing UI components
  lib/                 City renderer, walking grid, and world models
  hooks/               UI hooks
  public/              Static assets
backend/
  visitors.ts          Visitor HTTP service, validation, limits, moderation
  worker.ts            Independently deployable API entrypoint
  db/schema.ts         Database schema
  scripts/             Owner moderation command
  test/                Persistent SQLite/API tests
  wrangler.jsonc       Standalone API configuration
db/schema.ts           Sites schema entrypoint (re-exports the backend schema)
drizzle/               Generated, versioned SQL migrations
scripts/               Shared verification and local tooling
vite.config.ts         Shared build and deployment integration
```

One root package.json and lockfile deliberately manage both folders. Run commands from the repository root. Frontend rendering does not contain database queries or secrets. `frontend/app/api/visitors/route.ts` only delegates requests to the backend service. This keeps one-origin deployment simple while allowing the API to run separately later.

## Local development

Use Node 22.13 or newer (Node 24 is used for verification).

```sh
npm ci
npm run db:migrate
npm run dev
```

Open the URL printed by the server. Choose **Visitor yard**, then **Walk across the bridge**, or select Visitor Yard from the neighborhood menu. When you arrive, leave a name at the pedestal or use the yard panel. Click a stone to read its full name/date or copy its link.

The local D1 database lives in ignored `.wrangler/state`. It survives server restarts. Local previews and the standalone API share this state. The database starts empty; there are no invented visitors. Localhost has a development-only secret fallback. Hosted writes require an explicit secret.

```sh
npm test                 # Rendering, walking routes, and database/API behavior
npm run typecheck
npm run build            # Combined frontend + backend Worker in dist/
npm run build:backend    # Standalone API bundle in backend/dist/ (no deployment)
npm run dev:backend      # Optional API-only local server, port 8787
```

## Visitor records

Slates contain a generated ID, display name, creation time, stable sequence/position, and hidden status. An HTTP-only browser cookie is hashed server-side to recognize an existing visit. Retrying a submission returns the same slate. This is a best-effort one-slate-per-browser rule; clearing cookies or changing devices can create another visit.

Names support Unicode letters and numbers plus spaces, apostrophes, underscores, and hyphens, up to 24 Unicode code points. There are no messages or links. The server bounds request sizes, validates names, rejects cross-origin writes, and allows at most five new submission attempts per network per hour. Network identifiers are keyed hashes that change hourly, never stored raw. Expired limit rows are pruned on subsequent submissions.

Each garden page has 48 assigned slots. Hidden entries retain their slots, so shared links and other visitors' positions stay stable. The UI refreshes the current page every 30 seconds while the tab is visible, and fetches only one garden at a time. Full names and dates are available in the panel, including names too long to read directly on an ASCII stone.

## Deployment

The default build keeps the frontend and backend on the same origin and is compatible with the existing Sites project. `.openai/hosting.json` declares the logical D1 binding `DB`; Sites provisions and binds the production database and applies the generated `drizzle/` migrations during publication. Local data is not automatically copied into production.

Before production, configure two separate random secrets of at least 32 characters in the host's secret settings:

- `VISITOR_SECRET`: stable HMAC secret for visitor/network identifiers. Changing it invalidates existing browser recognition.
- `VISITOR_ADMIN_TOKEN`: owner-only moderation credential. Never include it in frontend code or public environment variables.

`.dev.vars.example` documents their names. For local moderation, copy it to `.dev.vars` and populate the admin token; the standalone API reads `backend/.dev.vars` instead. Keep these files out of Git.

For an independent Cloudflare API deployment, use `backend/worker.ts` and `backend/wrangler.jsonc`. Replace the placeholder database ID with the real D1 ID, configure the secrets on that Worker, and apply the same migrations to its database before routing traffic. Route `/api/visitors` to that Worker **under the same public origin as the city**. The frontend already calls this path. Cross-origin API hosting is intentionally not enabled; it would require explicit CORS and cookie changes. The default combined build remains available, so splitting the physical deployments is optional.

No production deployment is performed by `npm run build` or `npm run build:backend`.

## Hide or restore a slate

Set `VISITOR_ADMIN_TOKEN` in your shell environment, using the same value configured on the backend. Take the slate ID from its copied link, then run:

```sh
npm run slate:moderate -- https://your-city.example slate-uuid hide
npm run slate:moderate -- https://your-city.example slate-uuid restore
```

Hiding is reversible. It removes the slate from public listing and lookup, while retaining its slot and preventing that browser from submitting a replacement. The token is never saved in a browser.

For later schema changes, edit `backend/db/schema.ts`, run `npm run db:generate`, inspect the generated migration, and apply it locally with `npm run db:migrate`. Keep deployed migration files and their metadata immutable.
