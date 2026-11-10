import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { adminSessionHeaders } from './helpers/admin-session.js'

const { findMany, findUnique, updateMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}))
vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    order: { findMany, findUnique, updateMany },
    refundRequest: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}))

const path = '/admin/orders'
const detailPath = `${path}/order-1`
const refundPath = `${detailPath}/refund`
const syncPath = `${detailPath}/sync-refund`
const paidOrder = {
  id: 'order-1',
  productName: 'Desk Notebook',
  amount: 950,
  quantity: 1,
  status: 'paid',
  paymentIntentId: 'pi_test_notebook',
}
const formHeaders = {
  origin: 'http://localhost:3000',
  'Content-Type': 'application/x-www-form-urlencoded',
}

beforeEach(() => {
  vi.resetModules()
  findMany.mockReset().mockResolvedValue([])
  findUnique.mockReset().mockResolvedValue(paidOrder)
  updateMany.mockReset().mockResolvedValue({ count: 1 })
  vi.stubEnv('ENABLE_LOCAL_ADMIN', 'true')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('does not expose the order list when local admin is disabled', async () => {
  vi.stubEnv('ENABLE_LOCAL_ADMIN', 'false')
  const { default: app } = await import('../src/app.js')

  expect((await app.request(path)).status).toBe(404)
  expect(findMany).not.toHaveBeenCalled()
})

it('requires admin credentials before querying orders', async () => {
  const { default: app } = await import('../src/app.js')
  const response = await app.request(path)

  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toBe('/admin/login?next=%2Fadmin%2Forders')
  expect(findMany).not.toHaveBeenCalled()
})

it('filters by status in the database and renders the latest matching orders', async () => {
  findMany.mockResolvedValue([{
    ...paidOrder,
    quantity: 1,
    createdAt: new Date('2026-11-09T04:19:00Z'),
  }])

  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const response = await app.request(`${path}?status=paid`, { headers })

  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    where: { status: 'paid' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
  }))
  const html = await response.text()
  expect(html).toContain('Desk Notebook')
  expect(html).toContain('$9.50')
  expect(html).toContain('>Paid</span>')
  expect(html).toContain(`href="${refundPath}"`)
  expect(html).toContain(`href="${detailPath}"`)
})

it('rejects unknown statuses without querying orders', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)

  expect((await app.request(`${path}?status=unknown`, { headers })).status).toBe(400)
  expect(findMany).not.toHaveBeenCalled()
})

it('opens a confirmation page without creating a Stripe refund', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  const createRefund = vi.spyOn(stripe.refunds, 'create').mockRejectedValue(new Error('Unexpected request'))

  const response = await app.request(refundPath, { headers })

  expect(response.status).toBe(200)
  expect(await response.text()).toContain('Original order total')
  expect(createRefund).not.toHaveBeenCalled()
})

it('blocks refund requests without admin credentials or from a different origin', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)

  const unauthorized = await app.request(refundPath, { method: 'POST', headers: formHeaders })
  expect(unauthorized.status).toBe(401)

  const crossOrigin = await app.request(refundPath, {
    method: 'POST',
    headers: { ...formHeaders, ...headers, origin: 'https://other.example' },
  })
  expect(crossOrigin.status).toBe(403)
  expect(findUnique).not.toHaveBeenCalled()
})

it('blocks refunds when the order is already refunded, unpaid, or missing a payment intent', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  const createRefund = vi.spyOn(stripe.refunds, 'create').mockRejectedValue(new Error('Unexpected request'))

  for (const order of [
    { ...paidOrder, status: 'refunded' },
    { ...paidOrder, status: 'pending' },
    { ...paidOrder, paymentIntentId: null },
  ]) {
    findUnique.mockResolvedValueOnce(order)
    const response = await app.request(refundPath, { method: 'POST', headers: { ...formHeaders, ...headers } })
    expect(response.status).toBe(409)
  }
  expect(createRefund).not.toHaveBeenCalled()
})

it('uses the same Stripe idempotency key for the order from the browser and API', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  const createRefund = vi.spyOn(stripe.refunds, 'create').mockImplementation(async () => {
    return { id: 're_test_notebook', status: 'pending' } as Awaited<ReturnType<typeof stripe.refunds.create>>
  })

  const browser = await app.request(refundPath, { method: 'POST', headers: { ...formHeaders, ...headers } })
  expect(browser.status).toBe(200)
  const html = await browser.text()
  expect(html).toContain('<strong>pending</strong>')
  expect(html).toContain('re_test_notebook')

  const api = await app.request('/api/orders/order-1/refund', {
    method: 'POST',
    headers: { authorization: 'Bearer test-admin-token-123456' },
  })
  expect(api.status).toBe(200)
  expect(await api.json()).toEqual({ refundId: 're_test_notebook', status: 'pending' })
  expect(createRefund).toHaveBeenCalledTimes(2)
  expect(updateMany).not.toHaveBeenCalled()
  for (const call of createRefund.mock.calls) {
    expect(call).toEqual([{ payment_intent: 'pi_test_notebook' }, { idempotencyKey: 'refund-order-1' }])
  }
})

it('records a full successful refund immediately, without waiting for a webhook', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  vi.spyOn(stripe.refunds, 'create').mockResolvedValue({
    id: 're_test_notebook',
    amount: 950,
    currency: 'usd',
    status: 'succeeded',
  } as Awaited<ReturnType<typeof stripe.refunds.create>>)

  const response = await app.request(refundPath, { method: 'POST', headers: { ...formHeaders, ...headers } })

  expect(response.status).toBe(200)
  expect(updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: 'order-1', paymentIntentId: 'pi_test_notebook', amount: 950, status: 'paid' },
    data: { status: 'refunded' },
  })
})

it('recovers a missed refund from order details without creating another refund', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  const create = vi.spyOn(stripe.refunds, 'create').mockRejectedValue(new Error('Unexpected refund'))
  const list = vi.spyOn(stripe.refunds, 'list').mockReturnValue((async function* () {
    yield { status: 'succeeded', currency: 'usd', amount: 350 }
    yield { status: 'succeeded', currency: 'usd', amount: 600 }
  })() as unknown as ReturnType<typeof stripe.refunds.list>)

  const detail = await app.request(detailPath, { headers })
  expect(detail.status).toBe(200)
  expect(await detail.text()).toContain('Check Stripe refund status')
  expect(list).not.toHaveBeenCalled()

  const unauthorized = await app.request(syncPath, { method: 'POST', headers: formHeaders })
  expect(unauthorized.status).toBe(401)
  const crossOrigin = await app.request(syncPath, {
    method: 'POST',
    headers: { ...formHeaders, ...headers, origin: 'https://other.example' },
  })
  expect(crossOrigin.status).toBe(403)
  expect(list).not.toHaveBeenCalled()

  const response = await app.request(syncPath, { method: 'POST', headers: { ...formHeaders, ...headers } })
  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toBe(`${detailPath}?refundChecked=1`)
  expect(list).toHaveBeenCalledExactlyOnceWith({ payment_intent: 'pi_test_notebook', limit: 100 })
  expect(updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: 'order-1', paymentIntentId: 'pi_test_notebook', amount: 950, status: 'paid' },
    data: { status: 'refunded' },
  })
  expect(create).not.toHaveBeenCalled()
})

it('keeps the order paid when the refund balance is pending or failed', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  vi.spyOn(stripe.refunds, 'list').mockReturnValue((async function* () {
    yield { status: 'succeeded', currency: 'usd', amount: 350 }
    yield { status: 'pending', currency: 'usd', amount: 600 }
    yield { status: 'failed', currency: 'usd', amount: 600 }
  })() as unknown as ReturnType<typeof stripe.refunds.list>)

  const response = await app.request(syncPath, { method: 'POST', headers: { ...formHeaders, ...headers } })
  expect(response.status).toBe(303)
  expect(updateMany).not.toHaveBeenCalled()
})
