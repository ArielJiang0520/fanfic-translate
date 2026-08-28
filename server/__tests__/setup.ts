// Loaded by bunfig.toml before any test file, which is the only moment this can be set:
// server/db.ts opens its Database at import time, so DB_PATH has to be right before the
// first `import { db } from '../db'` anywhere in the graph.

// A throwaway in-memory database, so tests never touch the dev or prod file.
process.env.DB_PATH = ':memory:'

// Not 'production': keeps index.ts from mounting the static-file handlers over the API.
process.env.NODE_ENV = 'test'
