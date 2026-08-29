# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`fanfic-translate` — a personal library of fic being translated, behind a login.
A **project** is either a **series** (many ordered chapters) or a **one-shot** (a single
document), and it also carries the **language pair** it translates between — chosen at creation,
fixed thereafter, and the thing every Translate press obeys. A chapter is the unit of work: it
holds the original and the translation, both saved explicitly, and the translation can be
generated again over the top.

The supported languages live in `src/languages.ts` (English, Spanish, Simplified Chinese,
Korean, Japanese, Vietnamese) — a code and an English name, and nothing else, because the server
imports this file too. That one `name` is both what the tab says and what the model is told to
translate into, so the label and the instruction cannot drift apart. **The UI is English
throughout**, whatever a project translates.

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
Three rules the routes enforce and the UI never offers a way around: **a project's type is fixed
at creation** (`PATCH /projects/:id` with a `type` key is a 400); **its language pair is fixed the
same way** (a `source_lang` or `target_lang` key is also a 400 — chapters already translated sit
in the old target, so re-pointing a project would leave a mixed library), and creation requires
two different supported codes; and **a one-shot always has exactly
one chapter** — created with the project in the same transaction, and refused for both
`POST /projects/:id/chapters` and `DELETE /chapters/:id`. Every response shape that names a
project carries `source_lang` / `target_lang`, including the `project` object nested in the two
chapter responses, because the editor needs the pair to label its pane and to fill in a translate
request. `PATCH /chapters/:id` is Save; it writes
only the keys present, so a rename cannot blank out text. `server/limits.ts` holds `MAX_TEXT_CHARS`,
shared with the translate route so a chapter can never be saved that is too long to translate.

**Translation (`server/routes/translate.ts`)** — deliberately stateless: it knows nothing about
chapters. The client streams the result into local state and persists it with
`PATCH /api/chapters/:id` when the user hits Save, which keeps the abort semantics below intact.
`POST /api/translate` takes `{ text, source_lang, target_lang }` and
streams the translation back as SSE frames (`{type:'chunk'|'error'|'done'}`) via Hono's
`streamSSE`. The caller names the languages rather than the route looking a project up — that is
what keeps the endpoint pure text-in, text-out, and chapter-blind.
Upstream is OpenRouter `deepseek/deepseek-v4-pro` with **no `provider` block**, which is
OpenRouter's auto route: it picks the provider and falls back on its own. The system prompt is
built per request from the two language names and is
one line — it stays one line. POST (not GET) means the client cannot use `EventSource`, so both
sides read the stream through `src/utils/sse.ts` — shared, which is why that file is under
`src/` and not `server/`, as is `src/languages.ts` for the same reason. A client disconnect
aborts the upstream fetch. `OPENROUTER_API_KEY`
comes from the environment; missing means a 500.

**Client (`src/`)** — `auth.tsx` holds the session in context, seeded by a `GET /api/me` on
mount (the `sid` cookie is httpOnly, so asking the server is the only way to know). `App.tsx`
puts `/` (`Library`), `/p/:projectId` (`ProjectScreen`) and `/c/:chapterId` (`Editor`) under one
layout route — `RequireAuth` wrapping `AppShell` — and `/login` under `LoginRoute`; both wait out
`loading` before redirecting, since either redirect would be wrong before `/me` answers.

`AppShell` owns the viewport (`h-dvh` + `overflow-hidden`) and the drawer, so screens render a
`TopBar` plus their own panes as flex children rather than scrolling the page. The drawer
(`components/Sidebar.tsx`) is **the account menu only** — username and Log out. It deliberately
does not mirror the library as a tree: that only restated the home screen. Navigation belongs to
the screens, so New project sits on the Library bar and New chapter on the project screen. Server state goes
through TanStack Query, with every key, hook and mutation in `src/queries.ts`. `api.ts` is for
JSON calls only — `Editor.tsx` calls `fetch` directly because its response is a stream.

`Editor.tsx` is the unit of work: two tabbed panes — Original, and one named after the project's
target language ("Spanish", "Simplified Chinese") — an explicit Save (there is no
autosave), an unsaved dot plus a `useBlocker` guard, and a confirm before a retranslate throws
away a translation that may have been edited by hand. Loading is keyed on the chapter id in a
ref, so a background refetch cannot overwrite what is being typed. Every modal in the app is a
bottom sheet from `components/Sheet.tsx`, because on a phone that puts the buttons under the
thumb.

`components/LanguagePair.tsx` is the only place a pair is drawn — compact flag → flag inside a
line of metadata, `labelled` when a sheet has room for the words. The flags come from
`components/flags.tsx`, which maps a language to one of six SVG components imported individually
from `country-flag-icons` so only those six are bundled. **Not emoji**: a flag emoji is a pair of
regional-indicator letters, and a platform without the glyphs (Windows) renders the letters
instead, so `GB` would show as the text "GB". `languages.ts` stays free of JSX for this reason —
the server imports it.

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

**Verify with `bun test` and nothing else.** Alongside `bunx tsc --noEmit` and `bun run build`,
that is the whole of what an agent should run to check its work. Do not boot a server, do not
curl the API, and do not call OpenRouter to "see it working" — leave that to a person. 

**Deployment** — Fly.io. `Dockerfile` builds the client on `oven/bun` and reinstalls without dev
dependencies; the server runs TypeScript directly (no server build step). A volume `fanfic_data`
is mounted at `/data`. Pushing to `main` deploys via `.github/workflows/fly-deploy.yml` (needs
the `FLY_API_TOKEN` repo secret).

## Conventions

Routes return `{ error: string }` with the status; the client's `api()` unwraps that into the
thrown `ApiError.message`, so an error string is read by a person and should read like one.
