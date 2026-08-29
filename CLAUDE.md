# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`fanfic-translate` — a personal library of fic being translated into Chinese, behind a login.
A **project** is either a **series** (many ordered chapters) or a **one-shot** (a single
document). A chapter is the unit of work: it holds the original and the translation, both saved
explicitly, and the translation can be generated again over the top.

**This is a mobile-only web app.** Every layout targets a phone and nothing else — one column,
an off-canvas drawer, actions pinned within thumb reach, `env(safe-area-inset-*)` on the bars.
There are no responsive breakpoints in the codebase and new UI should not add any.

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
`app.fetch` with no port. Auth (`middleware.ts` + `routes/auth.ts`) is cookie-session based: a
`sid` httpOnly cookie resolves to a `sessions` row, enforced by `authMiddleware`; passwords are
argon2 via `@node-rs/argon2`. `routes/auth.ts` mounts at `/api` rather than a subpath because it
owns both `/api/auth/*` and `/api/me`.

**Library (`server/routes/library.ts`)** — owns both `/api/projects/*` and `/api/chapters/*`, so
like `auth.ts` it mounts at `/api` rather than a subpath. Everything is scoped to the caller:
`ownedProject` / `ownedChapter` at the top of the file join back to `projects.user_id`, and a row
belonging to somebody else is a **404, not a 403**, so ids are not confirmable by probing.
Two rules the routes enforce and the UI never offers a way around: **a project's type is fixed at
creation** (`PATCH /projects/:id` with a `type` key is a 400), and **a one-shot always has exactly
one chapter** — created with the project in the same transaction, and refused for both
`POST /projects/:id/chapters` and `DELETE /chapters/:id`. `PATCH /chapters/:id` is Save; it writes
only the keys present, so a rename cannot blank out text. `server/limits.ts` holds `MAX_TEXT_CHARS`,
shared with the translate route so a chapter can never be saved that is too long to translate.

**Translation (`server/routes/translate.ts`)** — deliberately stateless: it knows nothing about
chapters. The client streams the result into local state and persists it with
`PATCH /api/chapters/:id` when the user hits Save, which keeps the abort semantics below intact.
`POST /api/translate` takes `{ text }` and
streams the Chinese back as SSE frames (`{type:'chunk'|'error'|'done'}`) via Hono's `streamSSE`.
Upstream is OpenRouter `deepseek/deepseek-v4-pro` with **no `provider` block**, which is
OpenRouter's auto route: it picks the provider and falls back on its own. The system prompt is
one line and stays that way. POST (not GET) means the client cannot use `EventSource`, so both
sides read the stream through `src/utils/sse.ts` — shared, which is why that file is under
`src/` and not `server/`. A client disconnect aborts the upstream fetch. `OPENROUTER_API_KEY`
comes from the environment; missing means a 500.

**Client (`src/`)** — `auth.tsx` holds the session in context, seeded by a `GET /api/me` on
mount (the `sid` cookie is httpOnly, so asking the server is the only way to know). `App.tsx`
puts `/` (`Library`), `/p/:projectId` (`ProjectScreen`) and `/c/:chapterId` (`Editor`) under one
layout route — `RequireAuth` wrapping `AppShell` — and `/login` under `LoginRoute`; both wait out
`loading` before redirecting, since either redirect would be wrong before `/me` answers.

`AppShell` owns the viewport (`h-dvh` + `overflow-hidden`) and the drawer, so screens render a
`TopBar` plus their own panes as flex children rather than scrolling the page. Server state goes
through TanStack Query, with every key, hook and mutation in `src/queries.ts`. `api.ts` is for
JSON calls only — `Editor.tsx` calls `fetch` directly because its response is a stream.

`Editor.tsx` is the unit of work: tabbed Original / 译文 panes, an explicit Save (there is no
autosave), an unsaved dot plus a `useBlocker` guard, and a confirm before a retranslate throws
away a translation that may have been edited by hand. Loading is keyed on the chapter id in a
ref, so a background refetch cannot overwrite what is being typed. Every modal in the app is a
bottom sheet from `components/Sheet.tsx`, because on a phone that puts the buttons under the
thumb.

**Database** — `server/schema.ts` is the single schema source (Drizzle table definitions).
`server/db.ts` opens the file at import time and applies any pending migrations from `drizzle/`
on startup. To change the schema: edit `schema.ts`, run `bun run db:generate`, commit the
generated migration. The DB path comes from `DB_PATH` (defaults to `./local.db`; production is
`/data/app.db` on the Fly volume).

**Tests** — `bun test`, over `server/**/*.test.ts`. `__tests__/helpers.ts` has `call()` (drives
`app.fetch` and returns status + parsed body + the raw `Response`) and `signup()`, which returns
an agent whose `cookie` can be handed straight back to `call`. Nothing in the suite hits
OpenRouter — the translate tests cover its guards and stop there. `bunfig.toml` preloads
`server/__tests__/setup.ts`, which points `DB_PATH` at `:memory:`; this has to happen before the
first import of `db.ts` anywhere in the graph, which is why it is a preload and not per-test code.

**Deployment** — Fly.io. `Dockerfile` builds the client on `oven/bun` and reinstalls without dev
dependencies; the server runs TypeScript directly (no server build step). A volume `fanfic_data`
is mounted at `/data`. Pushing to `main` deploys via `.github/workflows/fly-deploy.yml` (needs
the `FLY_API_TOKEN` repo secret).

## Conventions

Routes return `{ error: string }` with the status; the client's `api()` unwraps that into the
thrown `ApiError.message`, so an error string is read by a person and should read like one.
