import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import app from '../src/app.js'
import { env } from '../src/env.js'
import { stripe } from '../src/lib/stripe.js'

const { findFirst, updateMany } = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn() }))
vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    order: { findFirst, updateMany },
    refundRequest: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}))

const paidSession = {
  id: 'cs_test_catalog',
  metadata: { orderId: 'order-1' },
  payment_intent: 'pi_test_catalog',
  payment_status: 'paid',
  amount_total: 950,
  currency: 'usd',
}

function deliverSession(session = paidSession, secret = env.STRIPE_WEBHOOK_SECRET) {
  return deliverEvent('checkout.session.completed', session, secret)
}

function deliverEvent(type: string, object: object, secret = env.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id: 'evt_test_webhook', type, data: { object } })
  return app.request('/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': stripe.webhooks.generateTestHeaderString({ payload, secret }),
    },
    body: payload,
  })
}

beforeEach(() => {
  findFirst.mockReset().mockResolvedValue(null)
  updateMany.mockReset().mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('accepts a signed checkout event and marks only the matching pending order paid', async () => {
  const response = await deliverSession()

  expect(response.status).toBe(200)
  expect(updateMany).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: 'order-1',
      status: 'pending',
      amount: 950,
      OR: [{ sessionId: 'cs_test_catalog' }, { sessionId: null }],
    },
    data: { status: 'paid', paymentIntentId: 'pi_test_catalog', sessionId: 'cs_test_catalog' },
  })
})

it('rejects events signed with the wrong secret before updating the order', async () => {
  const response = await deliverSession(paidSession, 'whsec_wrong_test_secret')

  expect(response.status).toBe(400)
  expect(updateMany).not.toHaveBeenCalled()
})

it('acknowledges a completed but unpaid checkout without updating the order', async () => {
  const response = await deliverSession({ ...paidSession, payment_status: 'unpaid' })

  expect(response.status).toBe(200)
  expect(updateMany).not.toHaveBeenCalled()
})

it.each([
  ['charge.refunded', { payment_intent: 'pi_test_catalog', refunded: true }],
  ['refund.updated', { payment_intent: 'pi_test_catalog', status: 'succeeded' }],
])('syncs a signed %s event only after Stripe confirms the full amount', async (eventType, data) => {
  findFirst.mockResolvedValue({ id: 'order-1', amount: 950 })
  const list = vi.spyOn(stripe.refunds, 'list').mockReturnValue((async function* () {
    yield { status: 'succeeded', currency: 'usd', amount: 950 }
  })() as unknown as ReturnType<typeof stripe.refunds.list>)

  const response = await deliverEvent(eventType, data)

  expect(response.status).toBe(200)
  expect(list).toHaveBeenCalledExactlyOnceWith({ payment_intent: 'pi_test_catalog', limit: 100 })
  expect(updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: 'order-1', paymentIntentId: 'pi_test_catalog', amount: 950, status: 'paid' },
    data: { status: 'refunded' },
  })
})

it('leaves the order paid when only part of the charge was refunded', async () => {
  const response = await deliverEvent('charge.refunded', { payment_intent: 'pi_test_catalog', refunded: false })

  expect(response.status).toBe(200)
  expect(updateMany).not.toHaveBeenCalled()
})
