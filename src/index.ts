import { serve } from '@hono/node-server'
import app from './app.js'
import { listenHostname } from './env.js'

const port = Number(process.env.PORT ?? 3000)

serve({
  fetch: app.fetch,
  port: port,
  hostname: listenHostname
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})


