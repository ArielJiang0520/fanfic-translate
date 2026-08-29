# CLAUDE.md

## What this is

`fanfic-translate` — a private, login-gated library of fic being translated. A **project** is
either a **series** (many chapters) or a **one-shot** (one document), and carries a **language
pair** fixed at creation. A **chapter** holds an original and a translation, both saved
explicitly. Each project also has a mutable **glossary** (proper nouns) and free-text
**instructions**, both folded into every Translate press.

**Mobile-only.** One column, off-canvas drawer, `env(safe-area-inset-*)` on the bars. No
responsive breakpoints — don't add any. The UI is English whatever a project translates.

## Commands

Bun is the runtime for server and tooling (not Node).

```bash
bun install
bun run dev          # server (:3001) + Vite client (:5173)
bun run dev:server   # Hono API only, :3001
bun run dev:client   # Vite only, proxies /api -> 127.0.0.1:3001
bun run build        # vite build -> dist/
bunx tsc --noEmit    # type check
bun test             # server tests
bun run start        # production: serves dist/ + API on :3000
bun run db:generate  # write a migration after editing server/schema.ts
```

## Stack

Bun + Hono API, React 19 + React Router 7 (data router) + TanStack Query, Tailwind v4,
Drizzle ORM over `bun:sqlite`. `@/*` aliases `src/*`.

## Files

### `server/`

| file | what it does |
|---|---|
| `index.ts` | Mounts route groups under `/api`; serves `dist/` in production. Exports `app` so tests can use `app.fetch` with no port. |
| `db.ts` | Opens the SQLite file at import time and applies pending migrations from `drizzle/`. Path from `DB_PATH` (default `./local.db`; `/data/app.db` in production). |
| `schema.ts` | The only schema source: `users`, `sessions`, `projects`, `chapters`, `entities`. |
| `middleware.ts` | `authMiddleware` (resolves the `sid` cookie to a session), cookie helpers, session id generation. |
| `entities.ts` | Parses a glossary from a request body. Shared by the library and translate routes. |
| `instructions.ts` | Same, for the instructions string. |
| `routes/auth.ts` | Signup, login, logout, `/api/me`. Argon2 via `@node-rs/argon2`. Mounts at `/api` because it owns `/api/me` too. |
| `routes/library.ts` | All of `/api/projects/*` and `/api/chapters/*`. Also mounts at `/api`. |
| `routes/translate.ts` | `POST /api/translate` — streams SSE from OpenRouter. Stateless: knows nothing about chapters. |
| `routes/health.ts` | `/api/health`. |

### `src/`

| file | what it does |
|---|---|
| `main.tsx` | React root, query client, router. |
| `App.tsx` | Routes. `/`, `/p/:projectId`, `/c/:chapterId` under `RequireAuth` + `AppShell`; `/login` separate. |
| `auth.tsx` | Session context, seeded by `GET /api/me` on mount. |
| `api.ts` | JSON fetch helper; unwraps `{ error }` into a thrown `ApiError`. |
| `queries.ts` | Every TanStack Query key, hook and mutation, plus the client-side types. |
| `languages.ts` | The six supported languages (code + English name). Imported by the server too. |
| `limits.ts` | `MAX_TEXT_CHARS`, `MAX_ENTITIES`, `MAX_ENTITY_CHARS`, `MAX_INSTRUCTIONS_CHARS`. Imported by the server too. |
| `utils/sse.ts` | Reads SSE frames off a `fetch` body. Used by both sides. |
| `utils/time.ts` | Relative timestamp formatting. |
| `pages/Library.tsx` | Home: the project list. |
| `pages/ProjectScreen.tsx` | A series' chapter list. A one-shot never renders this. |
| `pages/Editor.tsx` | The unit of work: two tabbed panes, Translate/Stop, explicit Save, unsaved-changes guard. |
| `pages/Login.tsx` | Login and signup. |
| `components/AppShell.tsx` | Owns the viewport (`h-dvh` + `overflow-hidden`) and the drawer. |
| `components/Sidebar.tsx` | The drawer: username and Log out, nothing else. |
| `components/TopBar.tsx` | Title, back link, right-hand slot. |
| `components/Sheet.tsx` | `Sheet`, `ConfirmSheet`, `PromptSheet` — every modal is a bottom sheet. |
| `components/NewProjectSheet.tsx` | Create a project: title, type, language pair, optional instructions. |
| `components/EntitiesSheet.tsx` | The glossary editor. |
| `components/InstructionsSheet.tsx` | The instructions editor. |
| `components/LanguagePair.tsx` | Draws a pair as flag → flag. |
| `components/flags.tsx` | Six SVG flags from `country-flag-icons`. Not emoji — Windows renders those as letters. |
| `components/icons.tsx` | Inline SVG icons. |

### Elsewhere

| path | what it does |
|---|---|
| `drizzle/` | Generated migrations and snapshots. Commit them. |
| `server/__tests__/` | `bun test` suite. `helpers.ts` has `call()` and `signup()`. |
| `bunfig.toml` | Preloads `__tests__/setup.ts`, which points `DB_PATH` at `:memory:`. |
| `Dockerfile`, `fly.toml` | Fly.io deploy; volume `fanfic_data` at `/data`. Push to `main` deploys. |

## Rules the routes enforce

- A project's **type** is fixed at creation — `PATCH /projects/:id` with a `type` key is a 400.
- Its **language pair** is fixed the same way; creation requires two different supported codes.
- A **one-shot always has exactly one chapter** — created with the project, and both
  `POST /projects/:id/chapters` and `DELETE /chapters/:id` refuse it.
- A row belonging to another user is a **404, not a 403**.
- `PATCH` writes **only the keys it was given**; an empty patch is a 400.
- `PUT /projects/:id/entities` **replaces the whole list**; `position` is list order.
- Errors are `{ error: string }` with a status. The string is read by a person — write it that way.

## Testing

**Verify with `bun test` and nothing else.** Alongside `bunx tsc --noEmit` and `bun run build`,
that is the whole of what an agent should run to check its work. Do not boot a server, do not
curl the API, and do not call OpenRouter to "see it working" — leave that to a person.

Nothing in the suite hits OpenRouter; the translate tests cover its guards and stop there.
