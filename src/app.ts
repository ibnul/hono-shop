import { isIP } from 'node:net'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { basicAuth } from 'hono/basic-auth'
import { adminEnabled, env, trustLocalHttpsProxy } from './env.js'
import { authIpHeader, customerAuth } from './lib/auth.js'
import { prisma } from './lib/prisma.js'
import products from './routes/products.js'
import orders from './routes/orders.js'
import checkout from './routes/checkout.js'
import cart from './routes/cart.js'
import { timing } from './middleware/timing.js'
import { secureHeaders } from 'hono/secure-headers'
import { requestId } from 'hono/request-id'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { serveStatic } from '@hono/node-server/serve-static'
import pages from './routes/pages.js'
import { createAccountRoutes } from './routes/account.js'
import webhook from './routes/webhook.js'
import adminProducts from './routes/adminProducts.js'
import adminOrders from './routes/adminOrders.js'
import adminRefundRequests from './routes/adminRefundRequests.js'




const app = new Hono()

app.use(logger())
app.use(timing)
app.use(requestId())
app.use(secureHeaders())
if (trustLocalHttpsProxy) {
  app.use('*', async (c, next) => {
    if (c.req.header('X-Forwarded-Proto') !== 'https' || !isIP(c.req.header(authIpHeader) ?? '')) {
      return c.text('HTTPS proxy required', 403)
    }
    await next()
  })
}
app.use('/api/*', cors() )
app.use('/public/*', serveStatic({ root: './' }))


const api = new Hono().basePath('/api')
api.route('/products', products)
api.route('/orders', orders)
api.route('/checkout', checkout)

app.route('/', api)
app.route('/webhook', webhook)
if (adminEnabled) {
  const admin = new Hono()
  admin.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  admin.use('*', basicAuth({ username: 'admin', password: env.ADMIN_TOKEN, realm: 'Hono Shop Admin' }))
  admin.route('/products', adminProducts)
  admin.route('/orders', adminOrders)
  admin.route('/refund-requests', adminRefundRequests)
  app.route('/admin', admin)
}
if (customerAuth) {
  app.route('/account', createAccountRoutes(customerAuth))
}
app.route('/cart', cart)
app.route('/', pages)

app.notFound((c) => {
  return c.json(
    { error: { message: `Not Found: ${c.req.path}`, requestId: c.get('requestId')}},
    404
  )
})

app.onError(async ( err, c) => {
  if(err instanceof HTTPException){
    const response = err.getResponse()
    const challenge = response.headers.get('WWW-Authenticate')
    if (challenge) c.header('WWW-Authenticate', challenge)

    const message = err.message || (await response.text())
    return c.json(
      { error: { message, requestId: c.get('requestId')}},
      err.status
    )
  }
  console.error(err)

  return c.json(
    { error: { message: 'Something went wrong'}},
    500
  )
})

app.get('/api/health/db', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`

    return c.json({
      database: 'connected',
    })
  } catch (error) {
    console.error('Database connection failed:', error)

    return c.json(
      {
        database: 'unavailable',
      },
      500,
    )
  }
})


app.get('/api/db/products', async (c) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        active: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return c.json(products)
  } catch (error) {
    console.error('Failed to load products:', error)

    return c.json(
      {
        error: {
          message: 'Could not load products',
        },
      },
      500,
    )
  }
})

export default app
