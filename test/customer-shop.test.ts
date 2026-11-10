import type Stripe from 'stripe'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { adminSessionHeaders } from './helpers/admin-session.js'

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn(), findUnique: vi.fn() },
  user: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  order: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  wishlistItem: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  refundRequest: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  refundEvidence: { findUnique: vi.fn() },
  $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
}))

vi.mock('../src/lib/prisma.js', () => ({ prisma: db }))
vi.mock('../src/lib/auth.js', () => ({
  authOrigin: 'http://localhost:3000',
  customerAuth: {},
  getCustomerSession: async (headers: Headers) => {
    const userId = headers.get('x-test-user')
    return userId ? { user: { id: userId } } : null
  },
}))

const origin = 'http://localhost:3000'
const customerHeaders = { origin, 'x-test-user': 'user-1' }
const order = {
  id: 'order-1', userId: 'user-1', productId: 'mug', productName: 'Mug', quantity: 1,
  amount: 950, status: 'paid', paymentIntentId: 'pi_test_mug', sessionId: null,
  createdAt: new Date('2026-11-09T10:00:00Z'), refundRequest: null,
}
const request = {
  id: 'request-1', status: 'pending', reason: 'The handle arrived cracked.',
  rejectionNote: null, stripeRefundId: null, createdAt: order.createdAt,
  evidence: { mimeType: 'image/jpeg' },
  order: { ...order, user: { name: 'Shopper', email: 'shopper@example.com' } },
}
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('ENABLE_LOCAL_ADMIN', 'true')
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-only-customer-shop-secret-0fd69daa')
  db.product.findUnique.mockResolvedValue({ id: 'mug', name: 'Mug', price: 950 })
  db.order.findUnique.mockResolvedValue(order)
  db.order.findFirst.mockImplementation(async ({ where }) => (
    where.id === order.id && where.userId === order.userId ? order : null
  ))
  db.refundRequest.findUnique.mockResolvedValue(request)
  db.refundRequest.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('uses a Stripe Customer with the signed-in email and associates the order with its owner', async () => {
  const { default: app } = await import('../src/app.js')
  const { stripe } = await import('../src/lib/stripe.js')
  db.order.create.mockResolvedValue({ ...order, status: 'pending' })
  db.user.findUniqueOrThrow.mockResolvedValue({ email: 'shopper@example.com', stripeCustomerId: null })
  db.user.updateMany.mockResolvedValue({ count: 1 })
  const createCustomer = vi.spyOn(stripe.customers, 'create')
    .mockResolvedValue({ id: 'cus_test_shopper' } as Stripe.Response<Stripe.Customer>)
  const checkout = vi.spyOn(stripe.checkout.sessions, 'create')
    .mockResolvedValue({ id: 'cs_test_order', url: 'https://checkout.stripe.com/test' } as Stripe.Response<Stripe.Checkout.Session>)

  const response = await app.request('/buy/mug', {
    method: 'POST', headers: customerHeaders, body: new URLSearchParams({ quantity: '1' }),
  })

  expect(response.status).toBe(303)
  expect(db.order.create).toHaveBeenCalledWith(expect.objectContaining({
    data: { userId: 'user-1', productId: 'mug', productName: 'Mug', quantity: 1, amount: 950 },
  }))
  expect(createCustomer).toHaveBeenCalledExactlyOnceWith(
    { email: 'shopper@example.com' }, { idempotencyKey: 'customer-user-1' },
  )
  expect(db.user.updateMany).toHaveBeenCalledWith({
    where: { id: 'user-1', stripeCustomerId: null }, data: { stripeCustomerId: 'cus_test_shopper' },
  })
  expect(checkout).toHaveBeenCalledWith(
    expect.objectContaining({ customer: 'cus_test_shopper' }), { idempotencyKey: 'checkout-order-1' },
  )
})

it('scopes purchase history and order lookups to the signed-in owner', async () => {
  const { default: app } = await import('../src/app.js')
  db.order.findMany.mockResolvedValue([order])

  expect((await app.request('/account/orders')).headers.get('Location')).toBe('/account/sign-in')
  const history = await app.request('/account/orders', { headers: customerHeaders })
  expect(history.status).toBe(200)
  expect(await history.text()).toContain('/account/orders/order-1/refund')
  expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }))

  const own = await app.request('/api/orders/order-1', { headers: customerHeaders })
  expect(own.status).toBe(200)
  expect(await own.json()).not.toHaveProperty('userId')
  const other = { origin, 'x-test-user': 'another-customer' }
  expect((await app.request('/api/orders/order-1', { headers: other })).status).toBe(404)
  expect((await app.request('/api/checkout', {
    method: 'POST', headers: { ...other, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'order-1' }),
  })).status).toBe(404)
  expect((await app.request('/account/orders/order-1/refund', { headers: other })).status).toBe(404)
})

it('saves and removes wishlist items for the signed-in customer', async () => {
  const { default: app } = await import('../src/app.js')
  const url = '/account/wishlist/mug'
  const saved = await app.request(url, {
    method: 'POST', headers: customerHeaders,
    body: new URLSearchParams({ action: 'save', returnTo: 'shop' }),
  })
  expect(saved.headers.get('Location')).toBe('/')
  expect(db.wishlistItem.createMany).toHaveBeenCalledExactlyOnceWith({
    data: [{ userId: 'user-1', productId: 'mug' }], skipDuplicates: true,
  })

  db.wishlistItem.findMany.mockResolvedValue([{ product: { id: 'mug', name: 'Mug', price: 950, active: true } }])
  const list = await app.request('/account/wishlist', { headers: customerHeaders })
  expect(await list.text()).toContain('Remove from wishlist')
  expect(db.wishlistItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }))

  const removed = await app.request(url, {
    method: 'POST', headers: customerHeaders, body: new URLSearchParams({ action: 'remove' }),
  })
  expect(removed.headers.get('Location')).toBe('/account/wishlist')
  expect(db.wishlistItem.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { userId: 'user-1', productId: 'mug' } })

  const ajax = await app.request(url, {
    method: 'POST', headers: { ...customerHeaders, Accept: 'application/json' },
    body: new URLSearchParams({ action: 'save', returnTo: 'shop' }),
  })
  expect(ajax.status).toBe(200)
  expect(await ajax.json()).toEqual({ saved: true })
})

it('stores a valid defect attachment and limits the download to admins', async () => {
  const { default: app } = await import('../src/app.js')
  const adminHeaders = await adminSessionHeaders(app)
  const url = '/account/orders/order-1/refund'
  const bad = new FormData()
  bad.set('reason', request.reason)
  bad.set('evidence', new File(['<svg/>'], 'forged.jpg', { type: 'image/jpeg' }))
  expect((await app.request(url, { method: 'POST', headers: customerHeaders, body: bad })).status).toBe(400)
  expect(db.refundRequest.create).not.toHaveBeenCalled()

  const valid = new FormData()
  valid.set('reason', request.reason)
  valid.set('evidence', new File([jpeg], 'photo.jpg', { type: 'image/jpeg' }))
  const submitted = await app.request(url, { method: 'POST', headers: customerHeaders, body: valid })
  expect(submitted.status).toBe(303)
  expect(db.refundRequest.create).toHaveBeenCalledExactlyOnceWith({
    data: { orderId: order.id, reason: request.reason, evidence: { create: { content: Buffer.from(jpeg), mimeType: 'image/jpeg' } } },
    select: { id: true },
  })

  const evidenceUrl = '/admin/refund-requests/request-1/evidence'
  expect((await app.request(evidenceUrl, { headers: customerHeaders })).status).toBe(303)
  expect((await app.request(`${evidenceUrl}?preview=1`, { headers: customerHeaders })).status).toBe(303)
  expect(db.refundEvidence.findUnique).not.toHaveBeenCalled()

  db.refundEvidence.findUnique.mockResolvedValue({ content: jpeg, mimeType: 'image/jpeg' })
  const download = await app.request(evidenceUrl, { headers: adminHeaders })
  expect(download.status).toBe(200)
  expect(download.headers.get('Content-Disposition')).toBe('attachment; filename="refund-evidence.jpg"')
  expect(new Uint8Array(await download.arrayBuffer())).toEqual(jpeg)

  const review = await app.request('/admin/refund-requests/request-1', { headers: adminHeaders })
  const html = await review.text()
  expect(html).toContain('Preview photo')
  expect(html).toContain('Download evidence')
  expect(html).toContain('data-evidence-src="/admin/refund-requests/request-1/evidence?preview=1"')
  const preview = await app.request(`${evidenceUrl}?preview=1`, { headers: adminHeaders })
  expect(preview.status).toBe(200)
  expect(preview.headers.get('Content-Disposition')).toBe('inline; filename="refund-evidence.jpg"')
  expect(preview.headers.get('Cache-Control')).toContain('no-store')
  expect(new Uint8Array(await preview.arrayBuffer())).toEqual(jpeg)
})

it('claims an approval, uses the existing Stripe refund key, and updates the order and request', async () => {
  const { default: app } = await import('../src/app.js')
  const adminHeaders = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  vi.spyOn(stripe.refunds, 'list').mockReturnValue((async function* () {})() as unknown as ReturnType<typeof stripe.refunds.list>)
  const create = vi.spyOn(stripe.refunds, 'create').mockResolvedValue({
    id: 're_test', status: 'succeeded', currency: 'usd', amount: 950,
  } as Stripe.Response<Stripe.Refund>)

  const url = '/admin/refund-requests/request-1/approve'
  const review = await app.request('/admin/refund-requests/request-1', { headers: adminHeaders })
  expect(await review.text()).toContain(request.reason)
  expect(create).not.toHaveBeenCalled()

  const approved = await app.request(url, { method: 'POST', headers: adminHeaders })
  expect(approved.status).toBe(303)
  expect(db.refundRequest.updateMany).toHaveBeenNthCalledWith(1, {
    where: { id: request.id, status: 'pending' }, data: { status: 'processing' },
  })
  expect(create).toHaveBeenCalledExactlyOnceWith({ payment_intent: order.paymentIntentId }, { idempotencyKey: 'refund-order-1' })
  expect(db.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'refunded' } }))
  expect(db.refundRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'approved' } }))
})

it('rejects a request with a customer-visible reason without contacting Stripe', async () => {
  const { default: app } = await import('../src/app.js')
  const adminHeaders = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  const create = vi.spyOn(stripe.refunds, 'create').mockRejectedValue(new Error('Unexpected refund'))
  const reason = 'The damage does not match this order.'
  const result = await app.request('/admin/refund-requests/request-1/reject', {
    method: 'POST', headers: adminHeaders, body: new URLSearchParams({ reason }),
  })
  expect(result.status).toBe(303)
  expect(db.refundRequest.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: request.id, status: 'pending', order: { status: 'paid' } },
    data: { status: 'rejected', rejectionNote: reason },
  })
  expect(create).not.toHaveBeenCalled()

  db.order.findFirst.mockResolvedValue({ ...order, refundRequest: { ...request, status: 'rejected', rejectionNote: reason } })
  const detail = await app.request('/account/orders/order-1/refund', { headers: customerHeaders })
  expect(await detail.text()).toContain(reason)
})

it('keeps an in-progress Stripe refund in review and never submits another while it is pending', async () => {
  const { default: app } = await import('../src/app.js')
  const adminHeaders = await adminSessionHeaders(app)
  const { stripe } = await import('../src/lib/stripe.js')
  db.refundRequest.findUnique.mockResolvedValue({ ...request, status: 'processing', stripeRefundId: 're_pending' })
  vi.spyOn(stripe.refunds, 'list').mockReturnValue((async function* () {
    yield { status: 'pending', amount: 950, currency: 'usd' }
  })() as unknown as ReturnType<typeof stripe.refunds.list>)
  const retrieve = vi.spyOn(stripe.refunds, 'retrieve')
    .mockResolvedValue({ id: 're_pending', status: 'pending' } as Stripe.Response<Stripe.Refund>)
  const create = vi.spyOn(stripe.refunds, 'create').mockRejectedValue(new Error('Unexpected refund'))

  const result = await app.request('/admin/refund-requests/request-1/approve', { method: 'POST', headers: adminHeaders })
  expect(result.status).toBe(303)
  expect(retrieve).toHaveBeenCalledExactlyOnceWith('re_pending')
  expect(create).not.toHaveBeenCalled()
  expect(db.order.updateMany).not.toHaveBeenCalled()
  expect(db.refundRequest.updateMany).not.toHaveBeenCalled()
})

it('renders a video preview and serves byte ranges for playback', async () => {
  const { default: app } = await import('../src/app.js')
  const adminHeaders = await adminSessionHeaders(app)
  db.refundRequest.findUnique.mockResolvedValue({ ...request, evidence: { mimeType: 'video/mp4' } })
  const video = Uint8Array.from({ length: 16 }, (_, index) => index)
  db.refundEvidence.findUnique.mockResolvedValue({ content: video, mimeType: 'video/mp4' })

  const review = await app.request('/admin/refund-requests/request-1', { headers: adminHeaders })
  const html = await review.text()
  expect(html).toContain('Preview video')
  expect(html).toContain('<video controls')

  const url = '/admin/refund-requests/request-1/evidence?preview=1'
  const partial = await app.request(url, { headers: { ...adminHeaders, Range: 'bytes=2-5' } })
  expect(partial.status).toBe(206)
  expect(partial.headers.get('Accept-Ranges')).toBe('bytes')
  expect(partial.headers.get('Content-Range')).toBe('bytes 2-5/16')
  expect(partial.headers.get('Content-Length')).toBe('4')
  expect(new Uint8Array(await partial.arrayBuffer())).toEqual(video.slice(2, 6))

  const suffix = await app.request(url, { headers: { ...adminHeaders, Range: 'bytes=-3' } })
  expect(suffix.headers.get('Content-Range')).toBe('bytes 13-15/16')
  expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(video.slice(-3))

  const invalid = await app.request(url, { headers: { ...adminHeaders, Range: 'bytes=20-' } })
  expect(invalid.status).toBe(416)
  expect(invalid.headers.get('Content-Range')).toBe('bytes */16')
})
