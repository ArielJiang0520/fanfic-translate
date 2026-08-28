import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import type { Variables } from './middleware'
import healthRoutes from './routes/health'

// Exported so the API tests can drive the real, fully-mounted app through `app.fetch`
// without opening a port.
export const app = new Hono<{ Variables: Variables }>()

app.route('/api/health', healthRoutes)

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
