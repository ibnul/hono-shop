import { createHash, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { z } from 'zod'
import { env, localAccountHostname } from '../env.js'
import { getCustomerSession } from '../lib/auth.js'
import { cartQuantity, maxCartQuantity, readCart, rememberCartCheckout, writeCart } from '../lib/cart.js'
import { prisma } from '../lib/prisma.js'
import { createCheckoutSession, stripe } from '../lib/stripe.js'
import { validate } from '../lib/validate.js'
import { createCartOrder } from '../store/orders.js'
import { ShoppingCart } from '../views/cart.js'

const app = new Hono()
const quantity = z.coerce.number().int().min(1).max(maxCartQuantity)
const cartForm = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), quantity }),
  z.object({ action: z.literal('update'), quantity }),
  z.object({ action: z.literal('remove') }),
])

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store')
  await next()
})
app.use('*', csrf({ origin: new URL(env.APP_URL).origin }))
const smallForm = bodyLimit({ maxSize: 4096 })

async function cartRows(cart: Map<string, number>) {
  const products = cart.size ? await prisma.product.findMany({
    where: { id: { in: [...cart.keys()] }, active: true },
    select: { id: true, name: true, price: true },
  }) : []
  const catalog = new Map(products.map((product) => [product.id, product]))
  return [...cart].map(([id, quantity]) => ({ id, quantity, product: catalog.get(id) }))
}

async function renderCart(c: Context, cart: Map<string, number>, error?: string) {
  if (error && c.req.header('Accept') === 'application/json') {
    return c.json({ error: { message: error } }, 409)
  }

  const rows = await cartRows(cart)
  return c.html(
    <ShoppingCart rows={rows} error={error} showAccount={Boolean(localAccountHostname)} checkoutAttempt={randomUUID()} />,
    error ? 409 : 200,
  )
}

app.get('/', (c) => renderCart(c, readCart(c)))

app.post('/items/:productId', smallForm, validate('form', cartForm), async (c) => {
  const productId = c.req.param('productId')
  const form = c.req.valid('form')
  const cart = readCart(c)

  if (form.action === 'remove') {
    cart.delete(productId)
  } else {
    if (form.action === 'update' && !cart.has(productId)) {
      return renderCart(c, cart, 'This item is no longer in your cart.')
    }
    const product = await prisma.product.findUnique({
      where: { id: productId, active: true },
      select: { id: true },
    })
    if (!product) return renderCart(c, cart, 'This product is currently unavailable.')

    const updatedQuantity = form.action === 'add'
      ? (cart.get(product.id) ?? 0) + form.quantity
      : form.quantity
    if (updatedQuantity > maxCartQuantity) {
      return renderCart(c, cart, `You can add up to ${maxCartQuantity} of each product.`)
    }
    cart.set(product.id, updatedQuantity)
  }

  if (!writeCart(c, cart)) {
    return renderCart(c, readCart(c), 'Your cart is full. Remove an item before adding another.')
  }

  if (c.req.header('Accept') === 'application/json') {
    return c.json({ count: cartQuantity(cart) })
  }
  return c.redirect('/cart', 303)
})

app.post('/checkout', smallForm, validate('form', z.object({ attempt: z.uuid() })), async (c) => {
  const cart = readCart(c)
  if (!cart.size) return renderCart(c, cart, 'Add a product before checking out.')

  const items = []
  for (const row of await cartRows(cart)) {
    if (!row.product) return renderCart(c, cart, 'Remove unavailable items before checking out.')
    items.push({ productId: row.id, productName: row.product.name, unitPrice: row.product.price, quantity: row.quantity })
  }

  const customer = await getCustomerSession(c.req.raw.headers)
  const userId = customer?.user.id
  const { attempt } = c.req.valid('form')
  const checkoutKey = createHash('sha256').update(JSON.stringify([userId ?? null, attempt, [...cart].sort()])).digest('hex')
  const order = await createCartOrder(checkoutKey, items, userId)

  const session = order.sessionId
    ? await stripe.checkout.sessions.retrieve(order.sessionId)
    : await createCheckoutSession(order)
  if (session.status === 'complete' || session.payment_status === 'paid') {
    rememberCartCheckout(c, order.id)
    return c.redirect(`/success?session_id=${encodeURIComponent(session.id)}`, 303)
  }
  if (session.status !== 'open' || !session.url) {
    return renderCart(c, cart, 'This checkout is no longer open. Use Checkout to start again.')
  }

  rememberCartCheckout(c, order.id)
  return c.redirect(session.url, 303)
})

export default app
