import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { getCustomerSession } from '../lib/auth.js'
import { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { maxEvidenceBytes, readRefundEvidence } from '../lib/refundEvidence.js'
import { validate } from '../lib/validate.js'
import { orderItemSelection } from '../store/orders.js'
import { AccountOrders } from '../views/customer/orders.js'
import { CustomerRefund } from '../views/customer/refund.js'
import { Wishlist } from '../views/customer/wishlist.js'

const app = new Hono<{ Variables: { customerId: string } }>()
const refundFields = { status: true, reason: true, rejectionNote: true } as const
const orderFields = {
  id: true, productName: true, status: true, amount: true, quantity: true, createdAt: true,
  paymentIntentId: true, items: orderItemSelection, refundRequest: { select: refundFields },
} as const
const reasonSchema = z.string().trim().min(10).max(2000)

app.use('*', async (c, next) => {
  const session = await getCustomerSession(c.req.raw.headers)
  if (!session) return c.redirect('/account/sign-in', 303)
  c.set('customerId', session.user.id)
  await next()
})

async function findCustomerOrder(id: string, userId: string) {
  const order = await prisma.order.findFirst({ where: { id, userId }, select: orderFields })
  if (!order) throw new HTTPException(404, { message: 'Order not found' })
  return order
}

app.get('/orders', async (c) => {
  const search = (c.req.query('q') ?? '').trim().slice(0, 120)
  const sort = c.req.query('sort') === 'oldest' ? 'oldest' : 'newest'
  const direction = sort === 'oldest' ? 'asc' : 'desc'
  const orders = await prisma.order.findMany({
    where: { userId: c.get('customerId') },
    select: orderFields,
    orderBy: [{ createdAt: direction }, { id: direction }],
  })
  const term = search.toLowerCase()
  const matches = term ? orders.filter((order) => (
    order.id.toLowerCase().includes(term) || order.productName.toLowerCase().includes(term) ||
    order.items.some((item) => item.productName.toLowerCase().includes(term))
  )) : orders
  return c.html(<AccountOrders orders={matches} search={search} sort={sort} />)
})

app.get('/orders/:id/refund', async (c) => {
  const order = await findCustomerOrder(c.req.param('id'), c.get('customerId'))
  if (!order.refundRequest && (order.status !== 'paid' || !order.paymentIntentId)) {
    throw new HTTPException(409, { message: 'Only paid orders are eligible for a refund request.' })
  }

  return c.html(<CustomerRefund order={order} />)
})

app.post('/orders/:id/refund', bodyLimit({ maxSize: maxEvidenceBytes + 64 * 1024 }), async (c) => {
  const order = await findCustomerOrder(c.req.param('id'), c.get('customerId'))
  const location = `/account/orders/${encodeURIComponent(order.id)}/refund`
  if (order.refundRequest) return c.redirect(location, 303)
  if (order.status !== 'paid' || !order.paymentIntentId) {
    throw new HTTPException(409, { message: 'Only paid orders are eligible for a refund request.' })
  }

  if (!c.req.header('Content-Type')?.startsWith('multipart/form-data;')) {
    throw new HTTPException(400, { message: 'Submit the refund form with an attachment.' })
  }

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    throw new HTTPException(400, { message: 'The upload could not be read.' })
  }
  const reason = reasonSchema.safeParse(form.get('reason'))
  if (!reason.success) {
    return c.html(<CustomerRefund order={order} error="Describe the defect and why you’re requesting a refund in 10–2,000 characters." />, 400)
  }

  try {
    const evidence = await readRefundEvidence(form.get('evidence'))
    await prisma.refundRequest.create({
      data: { orderId: order.id, reason: reason.data, evidence: { create: evidence } },
      select: { id: true },
    })
  } catch (error) {
    if (error instanceof HTTPException && (error.status === 400 || error.status === 413)) {
      return c.html(<CustomerRefund order={order} error={error.message} reason={reason.data} />, error.status)
    }
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
  }

  return c.redirect(location, 303)
})

app.get('/wishlist', async (c) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId: c.get('customerId') },
    orderBy: { createdAt: 'desc' },
    select: { product: { select: { id: true, name: true, price: true, active: true } } },
  })
  return c.html(<Wishlist items={items} />)
})

const wishlistForm = z.object({
  action: z.enum(['save', 'remove']),
  returnTo: z.enum(['shop', 'wishlist']).default('wishlist'),
})

app.post('/wishlist/:productId', bodyLimit({ maxSize: 8192 }), validate('form', wishlistForm), async (c) => {
  const productId = c.req.param('productId')
  const userId = c.get('customerId')
  const { action, returnTo } = c.req.valid('form')

  if (action === 'remove') {
    await prisma.wishlistItem.deleteMany({ where: { userId, productId } })
  } else {
    const product = await prisma.product.findUnique({ where: { id: productId, active: true }, select: { id: true } })
    if (!product) throw new HTTPException(404, { message: 'Product not found' })
    await prisma.wishlistItem.createMany({ data: [{ userId, productId }], skipDuplicates: true })
  }

  if (c.req.header('Accept') === 'application/json') {
    return c.json({ saved: action === 'save' })
  }
  return c.redirect(returnTo === 'shop' ? '/' : '/account/wishlist', 303)
})

export default app
