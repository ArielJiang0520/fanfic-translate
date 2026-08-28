# fanfic-translate

Bun + TypeScript + Vite + Hono, SQLite via Drizzle ORM, deployed to Fly.io.

## Setup

```bash
bun install
cp .env.example .env
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

After that, pushing to `main` deploys through GitHub Actions — set the `FLY_API_TOKEN` repo
secret (`fly tokens create deploy`).
