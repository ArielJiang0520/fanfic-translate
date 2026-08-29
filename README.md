# fanfic-translate

A personal library of fic being translated. Sign in, make a project — a **series**
with chapters, or a standalone **one-shot** — and pick the pair it translates between, English
into Spanish or Japanese into Korean or any other two of English, Spanish, Simplified Chinese,
Korean, Japanese and Vietnamese. That pair is the project's identity and cannot be changed
afterwards. Then open a chapter, paste the original, hit
Translate to stream the translation back, and Save. Both the original and the translation are
kept, and the translation can be generated again over the top.

Built for a phone: one column, a drawer for your account, and the buttons within thumb reach.

Bun + TypeScript + Vite + Hono, SQLite via Drizzle ORM, DeepSeek V4 Pro through OpenRouter,
deployed to Fly.io.

## Setup

```bash
bun install
cp .env.example .env   # then put your OpenRouter key in it
bun run dev
```

The client runs on http://localhost:5173 and proxies `/api` to the server on :3001.

## Scripts

| command | what it does |
| --- | --- |
| `bun run dev` | server + client together |
| `bun run build` | build the client into `dist/` |
| `bun run start` | production mode: API + `dist/` on :3000 |
| `bun run typecheck` | `tsc --noEmit` |
| `bun test` | server tests |
| `bun run db:generate` | write a migration from `server/schema.ts` into `drizzle/` |
| `bun run db:migrate` | apply migrations manually (the server also does this on boot) |
| `bun run db:studio` | Drizzle Studio |

## Deploying

First time:

```bash
fly apps create fanfic-translate
fly volumes create fanfic_data --region sjc --size 1
fly deploy
```

The server needs the OpenRouter key in production too:

```bash
fly secrets set OPENROUTER_API_KEY=...
```
