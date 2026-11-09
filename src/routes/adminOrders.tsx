import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { z } from 'zod'
import { env } from '../env.js'
import { OrderStatus } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { refundOrder, syncOrderRefund } from '../lib/stripe.js'
import { validate } from '../lib/validate.js'
import { findRefundableOrder, requireOrder } from '../store/orders.js'
import { RefundConfirmation, RefundResult } from '../views/admin/refund.js'
import { AdminOrderDetail, AdminOrders } from '../views/admin/orders.js'

const app = new Hono()
const statusFilter = z.enum(['all', ...Object.values(OrderStatus)])
const orderQuery = z.object({ status: statusFilter.default('all') })
const limit = 50
const adminCsrf = csrf({ origin: new URL(env.APP_URL).origin })

app.get('/', validate('query', orderQuery), async (c) => {
  const { status } = c.req.valid('query')
  const orders = await prisma.order.findMany({
    where: status === 'all' ? {} : { status },
    select: { id: true, productName: true, quantity: true, amount: true, status: true, createdAt: true, paymentIntentId: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  })

  return c.html(<AdminOrders orders={orders} status={status} limit={limit} />)
})

app.get('/:id', async (c) => {
  const order = await requireOrder(c.req.param('id'))
  return c.html(<AdminOrderDetail order={order} refundChecked={c.req.query('refundChecked') === '1'} />)
})

app.post('/:id/sync-refund', adminCsrf, async (c) => {
  const order = await requireOrder(c.req.param('id'))
  const { paymentIntentId } = order
  if (order.status === 'paid' && paymentIntentId) {
    await syncOrderRefund({ ...order, paymentIntentId })
  }

  return c.redirect(`/admin/orders/${encodeURIComponent(order.id)}?refundChecked=1`, 303)
})

app.get('/:id/refund', async (c) => {
  const order = await findRefundableOrder(c.req.param('id'))
  return c.html(<RefundConfirmation order={order} />)
})

app.post('/:id/refund', adminCsrf, async (c) => {
  const refund = await refundOrder(c.req.param('id'))
  return c.html(<RefundResult orderId={c.req.param('id')} refundId={refund.id} status={refund.status} />)
})

export default app
