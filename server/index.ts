import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import type { Variables } from './middleware'
import authRoutes from './routes/auth'
import healthRoutes from './routes/health'
import libraryRoutes from './routes/library'
import translateRoutes from './routes/translate'

export const app = new Hono<{ Variables: Variables }>()

app.route('/api/health', healthRoutes)
app.route('/api', authRoutes)
app.route('/api', libraryRoutes)
app.route('/api/translate', translateRoutes)

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

const defaultPort = process.env.NODE_ENV === 'production' ? '3000' : '3001'
const port = parseInt(process.env.PORT || defaultPort, 10)

export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
} satisfies Bun.Serve.Options<undefined>
