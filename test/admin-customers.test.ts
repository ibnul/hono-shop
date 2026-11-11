import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { adminSessionHeaders } from './helpers/admin-session.js'

const { user, order } = vi.hoisted(() => ({
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  order: { findMany: vi.fn() },
}))
vi.mock('../src/lib/prisma.js', () => ({ prisma: { user, order } }))

const customer = {
  id: 'customer-1', name: 'Desk Shopper', email: 'shopper@example.com',
  createdAt: new Date('2026-11-10T10:00:00Z'), _count: { orders: 3 },
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('ENABLE_LOCAL_ADMIN', 'true')
  user.findMany.mockResolvedValue([])
  user.findUnique.mockResolvedValue({ id: customer.id, name: customer.name, email: customer.email })
  order.findMany.mockResolvedValue([])
})

afterEach(() => vi.unstubAllEnvs())

it('requires admin sign-in and preserves the customer page as the login destination', async () => {
  const { default: app } = await import('../src/app.js')
  const guest = await app.request('/admin/customers')
  expect(guest.status).toBe(303)
  expect(guest.headers.get('Location')).toBe('/admin/login?next=%2Fadmin%2Fcustomers')
  expect(user.findMany).not.toHaveBeenCalled()

  const login = await app.request('/admin/login', {
    method: 'POST', headers: { origin: 'http://localhost:3000' },
    body: new URLSearchParams({
      username: 'admin', password: 'test-admin-token-123456', next: '/admin/customers',
    }),
  })
  expect(login.headers.get('Location')).toBe('/admin/customers')
})

it('paginates customer accounts and links to their orders', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  user.findMany.mockResolvedValue(Array.from({ length: 26 }, (_, index) => ({
    ...customer, id: `customer-${index}`, name: `Customer number ${index}`,
  })))
  const first = await app.request('/admin/customers', { headers })
  const firstHtml = await first.text()
  expect(first.status).toBe(200)
  expect(first.headers.get('Cache-Control')).toBe('no-store')
  expect(firstHtml).toContain('Customer number 24')
  expect(firstHtml).not.toContain('Customer number 25')
  expect(firstHtml).toContain('href="/admin/orders?customer=customer-0"')
  expect(firstHtml).toContain('href="/admin/customers?page=2"')
  expect(user.findMany).toHaveBeenLastCalledWith({
    select: { id: true, name: true, email: true, createdAt: true, _count: { select: { orders: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 0, take: 26,
  })

  user.findMany.mockResolvedValue([])
  const second = await app.request('/admin/customers?page=2', { headers })
  const secondHtml = await second.text()
  expect(secondHtml).toContain('There are no customers on this page.')
  expect(secondHtml).toContain('href="/admin/customers?page=1"')
  expect(secondHtml).not.toContain('href="/admin/customers?page=3"')
  expect(user.findMany.mock.lastCall?.[0].skip).toBe(25)
})

it('keeps the selected customer when filtering orders by status', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const response = await app.request('/admin/orders?customer=customer-1&status=paid', { headers })
  const html = await response.text()
  expect(response.status).toBe(200)
  expect(html).toContain(customer.name)
  expect(html).toContain(customer.email)
  expect(html).toContain('type="hidden" name="customer" value="customer-1"')
  expect(order.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: 'customer-1', status: 'paid' },
  }))

  user.findUnique.mockResolvedValue(null)
  order.findMany.mockClear()
  expect((await app.request('/admin/orders?customer=missing', { headers })).status).toBe(404)
  expect(order.findMany).not.toHaveBeenCalled()
})

it('rejects invalid page numbers before querying customers', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  for (const page of ['0', '-1', '1.5', 'invalid']) {
    expect((await app.request('/admin/customers?page=' + page, { headers })).status).toBe(400)
  }
  expect(user.findMany).not.toHaveBeenCalled()
})
