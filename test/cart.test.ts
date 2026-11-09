import type Stripe from 'stripe'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import app from '../src/app.js'
import { stripe } from '../src/lib/stripe.js'

const { product, order } = vi.hoisted(() => ({
  product: { findMany: vi.fn(), findUnique: vi.fn() },
  order: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}))
vi.mock('../src/lib/prisma.js', () => ({ prisma: { product, order } }))

const mug = { id: 'mug', name: 'Mug', price: 950, description: 'Ceramic mug' }
const hoodie = { id: 'hoodie', name: 'Hoodie', price: 4500, description: 'Cotton hoodie' }
const origin = 'http://localhost:3000'

beforeEach(() => {
  order.findUnique.mockReset().mockResolvedValue(null)
  order.create.mockReset()
  order.update.mockReset()
  product.findUnique.mockReset().mockImplementation(async ({ where }) => (
    [mug, hoodie].find(({ id }) => id === where.id) ?? null
  ))
  product.findMany.mockReset().mockImplementation(async ({ where }) => (
    [mug, hoodie].filter(({ id }) => !where.id?.in || where.id.in.includes(id))
  ))
})

afterEach(() => vi.restoreAllMocks())

function postItem(id: string, values: Record<string, string>, cookie?: string, requestOrigin = origin) {
  return app.request(`/cart/items/${id}`, {
    method: 'POST',
    headers: { origin: requestOrigin, ...(cookie && { cookie }) },
    body: new URLSearchParams(values),
  })
}

function getCartCookie(response: Response) {
  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toBe('/cart')
  const cookie = response.headers.get('Set-Cookie')
  expect(cookie).toContain('hono_shop_cart=')
  expect(cookie).toContain('HttpOnly')
  expect(cookie).toContain('SameSite=Lax')
  return cookie!.split(';', 1)[0]
}

it('shows both the existing Buy Now form and the Add to cart action', async () => {
  const response = await app.request('/')
  const html = await response.text()
  expect(html).toContain('href="/cart"')
  expect(html).toContain('action="/buy/mug"')
  expect(html).toContain('formaction="/cart/items/mug"')
  expect(html).toContain('>Add to cart</button>')
})

it('adds multiple products, combines quantities, updates them, and removes the final item', async () => {
  let cookie = getCartCookie(await postItem('mug', { action: 'add', quantity: '1' }))
  cookie = getCartCookie(await postItem('mug', { action: 'add', quantity: '2' }, cookie))
  cookie = getCartCookie(await postItem('hoodie', { action: 'add', quantity: '1' }, cookie))

  const cart = await app.request('/cart', { headers: { cookie } })
  expect(cart.status).toBe(200)
  expect(cart.headers.get('Cache-Control')).toContain('no-store')
  const html = await cart.text()
  expect(html).toContain('>Mug</strong>')
  expect(html).toContain('>Hoodie</strong>')
  expect(html).toContain('>$73.50</strong>')

  cookie = getCartCookie(await postItem('mug', { action: 'update', quantity: '2' }, cookie))
  cookie = getCartCookie(await postItem('hoodie', { action: 'remove' }, cookie))
  const updated = await app.request('/cart', { headers: { cookie } })
  const updatedHtml = await updated.text()
  expect(updatedHtml).not.toContain('>Hoodie</strong>')
  expect(updatedHtml).toContain('>$19.00</strong>')

  const removed = await postItem('mug', { action: 'remove' }, cookie)
  expect(getCartCookie(removed)).toBe('hono_shop_cart=')
  expect(removed.headers.get('Set-Cookie')).toContain('Max-Age=0')
  expect(await (await app.request('/cart')).text()).toContain('Your cart is empty.')
})

it('uses the latest active catalog prices and excludes products that become unavailable', async () => {
  const cookie = 'hono_shop_cart=' + encodeURIComponent(JSON.stringify([['mug', 2], ['hidden', 1]]))
  product.findMany.mockResolvedValue([{ ...mug, price: 1200 }])

  const response = await app.request('/cart', { headers: { cookie } })
  const html = await response.text()
  expect(product.findMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: { in: ['mug', 'hidden'] }, active: true },
    select: { id: true, name: true, price: true },
  })
  expect(html).toContain('Unavailable item')
  expect(html).toContain('>$24.00</strong>')
})

it('rejects cross-site mutations and prevents adding more than the allowed quantity', async () => {
  const crossSite = await postItem('mug', { action: 'add', quantity: '1' }, undefined, 'https://other.example')
  expect(crossSite.status).toBe(403)
  expect(product.findUnique).not.toHaveBeenCalled()

  const cookie = getCartCookie(await postItem('mug', { action: 'add', quantity: '10' }))
  const overflow = await postItem('mug', { action: 'add', quantity: '1' }, cookie)
  expect(overflow.status).toBe(409)
  expect(overflow.headers.get('Set-Cookie')).toBeNull()
  expect(await overflow.text()).toContain('You can add up to 10 of each product.')
})

it('ignores malformed carts and refuses to add a product that is unavailable', async () => {
  const cookie = 'hono_shop_cart=' + encodeURIComponent(JSON.stringify([['mug', -5]]))
  expect(await (await app.request('/cart', { headers: { cookie } })).text()).toContain('Your cart is empty.')
  expect(product.findMany).not.toHaveBeenCalled()

  const unavailable = await postItem('hidden', { action: 'add', quantity: '1' })
  expect(unavailable.status).toBe(409)
  expect(unavailable.headers.get('Set-Cookie')).toBeNull()
})

it('returns the updated cart count and session cookie for an AJAX add', async () => {
  const response = await app.request('/cart/items/mug', {
    method: 'POST',
    headers: { origin, Accept: 'application/json' },
    body: new URLSearchParams({ action: 'add', quantity: '2' }),
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('Location')).toBeNull()
  expect(await response.json()).toEqual({ count: 2 })
  const cookie = response.headers.get('Set-Cookie')!.split(';', 1)[0]
  expect(await (await app.request('/', { headers: { cookie } })).text()).toMatch(/data-cart-count[^>]*>2<\/span>/)
})

it('creates one order from current catalog prices and reuses the Checkout Session on retry', async () => {
  const items = [
    { productId: 'mug', productName: 'Mug', quantity: 2, unitPrice: 950 },
    { productId: 'hoodie', productName: 'Hoodie', quantity: 1, unitPrice: 4500 },
  ]
  const session = {
    id: 'cs_test_cart', status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/test',
  } as Stripe.Response<Stripe.Checkout.Session>
  const savedOrder = {
    id: 'order-cart', userId: null, status: 'pending', sessionId: null, items, amount: 6400,
  }
  order.create.mockResolvedValue(savedOrder)
  const create = vi.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue(session)
  const retrieve = vi.spyOn(stripe.checkout.sessions, 'retrieve').mockResolvedValue(session)
  const cookie = 'hono_shop_cart=' + encodeURIComponent(JSON.stringify([['mug', 2], ['hoodie', 1]]))
  const attempt = 'c273ed9e-95be-4ba5-a048-bd72628a045d'
  const checkout = () => app.request('/cart/checkout', {
    method: 'POST', headers: { origin, cookie }, body: new URLSearchParams({ attempt }),
  })

  const first = await checkout()
  expect(first.status).toBe(303)
  expect(first.headers.get('Location')).toBe(session.url)
  expect(first.headers.get('Set-Cookie')).toContain('hono_shop_cart_checkout=order-cart')
  expect(order.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    data: {
      cartCheckoutKey: expect.stringMatching(/^[0-9a-f]{64}$/),
      productId: null, productName: 'Cart order', quantity: 3, amount: 6400, items: { create: items },
    },
  }))
  expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    cancel_url: origin + '/cart',
    line_items: [
      { quantity: 2, price_data: { currency: 'usd', unit_amount: 950, product_data: { name: 'Mug' } } },
      { quantity: 1, price_data: { currency: 'usd', unit_amount: 4500, product_data: { name: 'Hoodie' } } },
    ],
  }), { idempotencyKey: 'checkout-order-cart' })

  order.findUnique.mockResolvedValue({ ...savedOrder, sessionId: session.id })
  const second = await checkout()
  expect(second.headers.get('Location')).toBe(session.url)
  expect(retrieve).toHaveBeenCalledExactlyOnceWith(session.id)
  expect(order.create).toHaveBeenCalledTimes(1)
  expect(create).toHaveBeenCalledTimes(1)
  expect(order.findUnique.mock.calls[0][0].where).toEqual(order.findUnique.mock.calls[1][0].where)
})

it('clears a matching cart only after Stripe confirms payment, and preserves later cart edits', async () => {
  order.findUnique.mockResolvedValue({
    id: 'order-cart', userId: null, sessionId: 'cs_test_cart', status: 'paid', amount: 1900,
    items: [{ productId: 'mug', productName: 'Mug', quantity: 2, unitPrice: 950 }],
  })
  const session = {
    id: 'cs_test_cart', payment_status: 'paid', amount_total: 1900, currency: 'usd',
    metadata: { orderId: 'order-cart' },
  } as Stripe.Response<Stripe.Checkout.Session>
  const retrieve = vi.spyOn(stripe.checkout.sessions, 'retrieve').mockResolvedValue(session)
  const success = (rows: [string, number][]) => app.request('/success?session_id=cs_test_cart', {
    headers: { cookie: 'hono_shop_cart_checkout=order-cart; hono_shop_cart=' + encodeURIComponent(JSON.stringify(rows)) },
  })

  const edited = await success([['mug', 2], ['hoodie', 1]])
  expect(edited.headers.getSetCookie().some((cookie) => cookie.startsWith('hono_shop_cart='))).toBe(false)

  retrieve.mockResolvedValueOnce({ ...session, payment_status: 'unpaid' })
  expect((await success([['mug', 2]])).headers.getSetCookie()).toHaveLength(0)

  const paid = await success([['mug', 2]])
  expect(paid.headers.getSetCookie()).toEqual(expect.arrayContaining([expect.stringContaining('hono_shop_cart=;')]))
  expect(await paid.text()).toContain('Mug × 2')
})
