import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { authOrigin } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'
import { refundEvidenceResponse } from '../lib/refundEvidence.js'
import { refundOrder, stripe, syncOrderRefund } from '../lib/stripe.js'
import { validate } from '../lib/validate.js'
import { orderItemSelection } from '../store/orders.js'
import { AdminRefundQueue, AdminRefundReview } from '../views/admin/refundRequests.js'

const app = new Hono()
const requestFields = {
  id: true, status: true, reason: true, rejectionNote: true, stripeRefundId: true, createdAt: true,
  evidence: { select: { mimeType: true } },
  order: {
    select: {
      id: true, productName: true, amount: true, status: true, paymentIntentId: true,
      user: { select: { name: true, email: true } },
      items: orderItemSelection,
    },
  },
} as const

app.use('*', csrf({ origin: authOrigin }))
app.use('*', bodyLimit({ maxSize: 8192 }))

async function requireRequest(id: string) {
  const request = await prisma.refundRequest.findUnique({ where: { id }, select: requestFields })
  if (!request) throw new HTTPException(404, { message: 'Refund request not found' })
  return request
}

app.get('/', async (c) => {
  const requests = await prisma.refundRequest.findMany({
    select: {
      id: true, status: true, createdAt: true,
      order: { select: { productName: true, amount: true, user: { select: { email: true } } } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  return c.html(<AdminRefundQueue requests={requests} />)
})

app.get('/:id', async (c) => {
  const request = await requireRequest(c.req.param('id'))
  return c.html(<AdminRefundReview request={request} refundError={c.req.query('refundError') === '1'} />)
})

app.get('/:id/evidence', async (c) => {
  const evidence = await prisma.refundEvidence.findUnique({
    where: { requestId: c.req.param('id') },
    select: { content: true, mimeType: true },
  })
  if (!evidence) throw new HTTPException(404, { message: 'Evidence not found' })
  return refundEvidenceResponse(evidence, {
    preview: c.req.query('preview') === '1',
    range: c.req.header('If-Range') ? undefined : c.req.header('Range'),
  })
})

app.post('/:id/reject', validate('form', z.object({ reason: z.string().trim().min(1).max(500) })), async (c) => {
  const id = c.req.param('id')
  const result = await prisma.refundRequest.updateMany({
    where: { id, status: 'pending', order: { status: 'paid' } },
    data: { status: 'rejected', rejectionNote: c.req.valid('form').reason },
  })
  if (!result.count) {
    throw new HTTPException(409, { message: 'This request is no longer available to reject.' })
  }
  return c.redirect(`/admin/refund-requests/${encodeURIComponent(id)}`, 303)
})

app.post('/:id/approve', async (c) => {
  const request = await requireRequest(c.req.param('id'))
  const location = `/admin/refund-requests/${encodeURIComponent(request.id)}`
  if (request.status === 'approved') return c.redirect(location, 303)
  if (request.status === 'rejected' || !request.order.paymentIntentId || request.order.status === 'pending') {
    throw new HTTPException(409, { message: 'This request is no longer eligible for a refund.' })
  }

  if (request.status === 'pending') {
    const claimed = await prisma.refundRequest.updateMany({
      where: { id: request.id, status: 'pending' },
      data: { status: 'processing' },
    })
    if (!claimed.count) {
      throw new HTTPException(409, { message: 'The request has changed. Refresh to see its current status.' })
    }
  }

  const { order } = request
  if (order.status === 'refunded') {
    await prisma.refundRequest.updateMany({
      where: { id: request.id, status: 'processing' },
      data: { status: 'approved' },
    })
    return c.redirect(location, 303)
  }

  try {
    if (await syncOrderRefund({ ...order, paymentIntentId: request.order.paymentIntentId })) {
      return c.redirect(location, 303)
    }

    const previous = request.stripeRefundId ? await stripe.refunds.retrieve(request.stripeRefundId) : null
    if (previous && previous.status !== 'failed' && previous.status !== 'canceled') {
      return c.redirect(location, 303)
    }

    const retryKey = previous ? `refund-${order.id}-after-${previous.id}` : undefined
    const refund = await refundOrder(order.id, retryKey)
    await prisma.refundRequest.updateMany({
      where: { id: request.id, stripeRefundId: request.stripeRefundId, status: { in: ['processing', 'approved'] } },
      data: { stripeRefundId: refund.id },
    })
    if (refund.status === 'failed' || refund.status === 'canceled') {
      return c.redirect(`${location}?refundError=1`, 303)
    }
  } catch (error) {
    console.error('Could not process refund request', request.id, error instanceof Error ? error.message : error)
    return c.redirect(`${location}?refundError=1`, 303)
  }

  return c.redirect(location, 303)
})

export default app
