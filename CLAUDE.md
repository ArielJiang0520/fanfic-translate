# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`fanfic-translate` — bootstrapped, not yet built out. The stack below is in place and the app is
a single placeholder page; there is no product code yet. Fill in this section once there is one.

## Runtime & commands

Bun is the runtime for both server and tooling (not Node).

```bash
bun install
bun run dev          # server (:3001) + Vite client (:5173) concurrently
bun run dev:server   # Hono API only, hot-reloaded, :3001
bun run dev:client   # Vite only, proxies /api -> 127.0.0.1:3001
bun run build        # vite build -> dist/
bunx tsc --noEmit    # type check
bun test             # server tests
bun run start        # production: NODE_ENV=production, serves dist/ + API on :3000
```

## Architecture

**Stack:** Bun + Hono API, React 19 + React Router 7 (data router) + TanStack Query client,
Tailwind v4, Drizzle ORM over `bun:sqlite`. `@/*` aliases `src/*` (configured in both
`vite.config.ts` and `tsconfig.json`).

**Server (`server/`)** — Hono app in `index.ts` mounts route groups under `/api`. In production
the same process also serves `dist/`. The app is exported so tests can drive it through
`app.fetch` with no port. Auth scaffolding (`middleware.ts`) is cookie-session based: a `sid`
httpOnly cookie resolves to a `sessions` row, enforced by `authMiddleware`.

**Database** — `server/schema.ts` is the single schema source (Drizzle table definitions).
`server/db.ts` opens the file at import time and applies any pending migrations from `drizzle/`
on startup. To change the schema: edit `schema.ts`, run `bun run db:generate`, commit the
generated migration. The DB path comes from `DB_PATH` (defaults to `./local.db`; production is
`/data/app.db` on the Fly volume).

**Tests** — `bun test`, over `server/**/*.test.ts`. `bunfig.toml` preloads
`server/__tests__/setup.ts`, which points `DB_PATH` at `:memory:`; this has to happen before the
first import of `db.ts` anywhere in the graph, which is why it is a preload and not per-test code.

**Deployment** — Fly.io. `Dockerfile` builds the client on `oven/bun` and reinstalls without dev
dependencies; the server runs TypeScript directly (no server build step). A volume `fanfic_data`
is mounted at `/data`. Pushing to `main` deploys via `.github/workflows/fly-deploy.yml` (needs
the `FLY_API_TOKEN` repo secret).

## Conventions

Fill in as they emerge.
