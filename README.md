# Sales-Outreach-AI — Deployment & Dev README

This repository contains a pnpm monorepo with a Vite React frontend (artifacts/outreach) and a Node/Express API (artifacts/api-server). This README explains how to run and deploy the project, with an emphasis on deploying the frontend and the API on Vercel (serverless), and notes about limitations and alternatives.

## What's in this repo
- Frontend: artifacts/outreach — Vite + React + Tailwind. Build output: artifacts/outreach/dist
- API: artifacts/api-server — Express app (src/app.ts) and a small start file (src/index.ts) that currently calls app.listen and starts a scheduler.
- Vercel config: vercel.json — configured to serve the static frontend and route `/api/*` to serverless functions under `api/`.
- Vercel adapter: api/index.ts — a minimal serverless adapter that imports and forwards requests to the Express `app` (not the file that calls listen).

Note: I made the minimal changes to support Vercel serverless functions: added `vercel.json` and `api/index.ts`.

---

## Deploying to Vercel (recommended for frontend + serverless API)

1. On Vercel: New Project → Import Git Repository → `goku-mechdesign/Sales-Outreach-AI`.
2. Project settings (during import or in Settings):
   - Install Command:
     ```bash
     corepack enable && pnpm install --frozen-lockfile
     ```
   - Build Command:
     ```bash
     pnpm -w --if-present run build
     ```
     (Workspace-aware build so local `workspace:*` packages are resolved.)
   - Output Directory: `artifacts/outreach/dist`
   - Node Version: 18.x (set in the Vercel UI if prompted)
3. Add Environment Variables (Project → Settings → Environment Variables). Examples used by this repo:
   - CLERK_PUBLISHABLE_KEY (required by Clerk middleware)
   - Any server-side secrets: e.g. DATABASE_URL, OPENAI_API_KEY, OTHER_API_KEY, etc.
   - Do NOT commit secrets to git.
4. Deploy and monitor build logs. Once successful, open the deployed URL.

Notes:
- vercel.json instructs Vercel to build the static site and to treat TypeScript files under `api/` as serverless functions.
- The serverless adapter at `api/index.ts` imports `artifacts/api-server/src/app` (the Express app) and forwards requests; it does NOT import `artifacts/api-server/src/index.ts` so the scheduler/listen code is not executed in serverless.

---

## Local development & testing

Prerequisites: Node 18+, corepack (bundled with Node >= 16.9), pnpm

From repo root:

1. Install dependencies

```bash
corepack enable && pnpm install
```

2. Build frontend (or run dev)

```bash
# dev server for frontend only
pnpm -w --filter @workspace/outreach run dev

# build frontend static files
pnpm -w --filter @workspace/outreach run build
```

3. Build api-server (if you want to test the build step locally)

```bash
pnpm -w --filter @workspace/api-server run build
```

4. Run both locally with Vercel dev (recommended to emulate functions + static site)

```bash
# Install vercel CLI and run in repo root
npm i -g vercel
vercel dev
```

`vercel dev` runs the static site and serverless functions so you can test `/api/*` endpoints locally.

---

## Important caveats and trade-offs

- Scheduler/background jobs: `startScheduler()` is invoked only from `artifacts/api-server/src/index.ts` (the file that calls `app.listen`). Because the serverless adapter imports only the Express app, the scheduler will NOT run on Vercel serverless functions. If your app depends on scheduled/background tasks, move them to one of:
  - Vercel Cron Jobs / scheduled serverless functions, or
  - A separate always-on service (Fly.io / Render / Railway / small VPS), or
  - GitHub Actions / external scheduler that hits an endpoint to run tasks.

- Cold starts / performance: serverless functions may cold-start. If your Express app imports many heavy modules, the first request latency may be high. If this is a problem, consider running the API as a dedicated service.

- Native modules & long-lived connections: serverless functions are not suitable for native addons or long-running processes (websockets, worker threads). If the API relies on these, deploy the API as a separate service (see alternatives below).

- Workspace packages: the API imports code from local `workspace:*` packages. Ensure `pnpm install` runs at repo root during Vercel install step so local packages are available during build.

---

## Alternatives (if serverless is unsuitable)

- Fly.io / Render / Railway: run `artifacts/api-server` as a small persistent Node service (Dockerfile included below example). These providers offer a free tier for small hobby apps.
- Keep frontend on Vercel/Cloudflare Pages and API on Fly/Render for always-on behavior.

Example Dockerfile for `artifacts/api-server` (for Fly/Render)

```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile
WORKDIR /app/artifacts/api-server
RUN pnpm run build

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=build /app/artifacts/api-server/dist ./dist
EXPOSE 3000
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
```

---

## Troubleshooting tips

- "pnpm: command not found" in Vercel builds: ensure Install Command includes `corepack enable` so pnpm is available.
- 500 errors from /api endpoints: check Vercel function logs; ensure required server-side env vars are set.
- Missing workspace packages at runtime: confirm `pnpm install` ran at the repo root during the Vercel install step.

---

## What I changed in the repo
- Added `vercel.json` at repo root (configures static build + routes to serverless API).
- Added `api/index.ts` — minimal serverless adapter that forwards to Express `app`.

If you want, I can also:
- Add a short `DEPLOY.md` with step-by-step screenshots for Vercel.
- Replace the minimal adapter with `serverless-http` wrapper for more compatibility.
- Add a Dockerfile in `artifacts/api-server/` for alternative deployments.

If you want me to make one of those changes, reply with which one and I will add it.