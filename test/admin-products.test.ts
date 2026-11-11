import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { adminSessionHeaders } from './helpers/admin-session.js'

const product = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))

vi.mock('../src/lib/prisma.js', () => ({ prisma: { product } }))

const path = '/admin/products'
const editPath = `${path}/desk-notebook/edit`
const origin = 'http://localhost:3000'
const fields = {
  id: 'desk-notebook',
  name: 'Desk Notebook',
  description: 'Lined pages',
  category: 'Stationery',
  price: '9.50',
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('ENABLE_LOCAL_ADMIN', 'true')
  product.findMany.mockResolvedValue([])
  product.findUnique.mockReset().mockResolvedValue(null)
  product.update.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('hides the admin page when the flag is off or the app URL is public', async () => {
  vi.stubEnv('ENABLE_LOCAL_ADMIN', 'false')
  const { default: disabledApp } = await import('../src/app.js')
  expect((await disabledApp.request(path)).status).toBe(404)

  vi.resetModules()
  vi.stubEnv('ENABLE_LOCAL_ADMIN', 'true')
  vi.stubEnv('APP_URL', 'https://shop.example.com')
  const { default: publicApp } = await import('../src/app.js')
  expect((await publicApp.request(path)).status).toBe(404)
  expect(product.findMany).not.toHaveBeenCalled()
})

it('redirects to admin login before listing products', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const unauthorized = await app.request(path)
  expect(unauthorized.status).toBe(303)
  expect(unauthorized.headers.get('Location')).toBe('/admin/login?next=%2Fadmin%2Fproducts')
  expect(product.findMany).not.toHaveBeenCalled()

  const response = await app.request(path, { headers })
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('Add product')
})

it('requires the HTTPS proxy and admin credentials for the public admin catalog', async () => {
  vi.stubEnv('APP_URL', 'https://shop.example.com')
  vi.stubEnv('TRUST_LOCAL_HTTPS_PROXY', 'true')
  vi.stubEnv('ENABLE_HTTPS_ADMIN', 'true')
  const token = 'test-admin-token-with-at-least-32-characters'
  vi.stubEnv('ADMIN_TOKEN', token)
  const { default: app } = await import('../src/app.js')
  const { listenHostname } = await import('../src/env.js')
  expect(listenHostname).toBe('127.0.0.1')

  const headers = { 'x-forwarded-proto': 'https', 'x-hono-client-ip': '198.51.100.10' }
  expect((await app.request(path)).status).toBe(403)
  expect((await app.request(path, { headers: { ...headers, 'x-forwarded-proto': 'http' } })).status).toBe(403)
  expect((await app.request(path, { headers: { ...headers, 'x-hono-client-ip': 'spoofed' } })).status).toBe(403)
  expect((await app.request(path, { headers })).status).toBe(303)
  expect(product.findMany).not.toHaveBeenCalled()

  const form = await app.request('/admin/login?next=' + encodeURIComponent(path), { headers })
  expect(form.status).toBe(200)
  expect(await form.text()).toContain('<h1>Admin login</h1>')

  const browserHeaders = { ...headers, origin: 'null', 'sec-fetch-site': 'same-origin' }
  const submit = (headers: Record<string, string>) => app.request('/admin/login', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ username: 'admin', password: token, next: path }),
  })
  expect((await submit({ ...browserHeaders, 'sec-fetch-site': 'cross-site' })).status).toBe(403)
  expect((await submit({ ...browserHeaders, 'sec-fetch-site': 'same-site' })).status).toBe(403)
  expect((await submit({ ...headers, origin: 'null' })).status).toBe(403)
  expect((await submit({ ...browserHeaders, origin: 'https://other.example' })).status).toBe(403)
  const login = await submit(browserHeaders)
  expect(login.status).toBe(303)
  expect(login.headers.get('Location')).toBe(path)
  const setCookie = login.headers.getSetCookie()[0]
  expect(setCookie).toMatch(/^__Host-hono-admin=/)
  expect(setCookie).toContain('; Secure')
  expect(setCookie).toContain('; HttpOnly')
  expect(setCookie).toContain('; SameSite=Strict')
  const session = { ...browserHeaders, cookie: setCookie.split(';', 1)[0] }
  const response = await app.request(path, { headers: session })
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.text()).toContain('action="/admin/logout"')

  const crossOrigin = await app.request('/admin/logout', {
    method: 'POST', headers: { ...session, origin: 'https://other.example' },
  })
  expect(crossOrigin.status).toBe(403)
  expect((await app.request(path, { headers: session })).status).toBe(200)

  const logout = await app.request('/admin/logout', { method: 'POST', headers: session })
  expect(logout.status).toBe(303)
  expect(logout.headers.get('Location')).toBe('/admin/login')
  expect(logout.headers.getSetCookie()[0]).toContain('Max-Age=0')
  expect((await app.request(path, { headers: session })).status).toBe(303)
})

it('throttles failed admin logins and only redirects within the admin pages', async () => {
  const { default: app } = await import('../src/app.js')
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const login = (password: string, next = '/admin/products') => app.request('/admin/login', {
    method: 'POST', headers: { origin },
    body: new URLSearchParams({ username: 'admin', password, next }),
  })

  for (let attempt = 0; attempt < 5; attempt++) {
    expect((await login('wrong-password')).status).toBe(401)
  }
  const blocked = await login('test-admin-token-123456')
  expect(blocked.status).toBe(429)
  expect(blocked.headers.get('Retry-After')).toBe('60')

  now += 60_001
  const accepted = await login('test-admin-token-123456', '/admin/../../outside')
  expect(accepted.status).toBe(303)
  expect(accepted.headers.get('Location')).toBe('/admin/orders')

  const cookie = accepted.headers.getSetCookie()[0].split(';', 1)[0]
  now += 8 * 60 * 60 * 1000
  expect((await app.request(path, { headers: { cookie } })).status).toBe(303)
})

it('rejects unauthenticated and cross-origin product submissions', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const body = new URLSearchParams(fields)
  const unauthorized = await app.request(path, { method: 'POST', headers: { origin }, body })
  expect(unauthorized.status).toBe(401)

  const forbidden = await app.request(path, {
    method: 'POST',
    headers: { ...headers, origin: 'https://other.example' },
    body,
  })
  expect(forbidden.status).toBe(403)
  expect(product.create).not.toHaveBeenCalled()
})

it('stores the price in cents and redirects to the admin catalog', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const response = await app.request(path, {
    method: 'POST',
    headers: { ...headers, origin },
    body: new URLSearchParams(fields),
  })

  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toBe(path)
  expect(product.create).toHaveBeenCalledWith({ data: { ...fields, price: 950 } })
})

it('loads a hidden product for editing and pre-fills its details', async () => {
  product.findUnique.mockResolvedValue({ ...fields, price: 950, active: false })
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)

  const response = await app.request(editPath, { headers })

  expect(response.status).toBe(200)
  expect(product.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: fields.id } })
  const html = await response.text()
  expect(html).toContain('value="Desk Notebook"')
  expect(html).toContain('value="9.50"')
  expect(html).toContain('>Lined pages</textarea>')
  expect(html).toContain('value="false" selected')
  expect(html).not.toContain('name="id"')
})

it.each([['true', true], ['false', false]])(
  'saves product details and visibility %s without changing the product ID',
  async (active, expectedVisibility) => {
    const { default: app } = await import('../src/app.js')
    const headers = await adminSessionHeaders(app)

    const response = await app.request(editPath, {
      method: 'POST',
      headers: { ...headers, origin },
      body: new URLSearchParams({ ...fields, id: 'another-product', price: '12.75', active }),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(path)
    expect(product.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: fields.id },
      data: {
        name: fields.name,
        description: fields.description,
        category: fields.category,
        price: 1275,
        active: expectedVisibility,
      },
    })
  },
)

it('rejects edits with invalid visibility or price before writing', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)

  for (const values of [
    { ...fields, active: 'maybe' },
    { ...fields, active: 'true', price: '12.755' },
  ]) {
    const response = await app.request(editPath, {
      method: 'POST',
      headers: { ...headers, origin },
      body: new URLSearchParams(values),
    })
    expect(response.status).toBe(400)
  }
  expect(product.update).not.toHaveBeenCalled()
})

it('returns 404 for a missing product on both edit routes', async () => {
  const { default: app } = await import('../src/app.js')
  const headers = await adminSessionHeaders(app)
  const { Prisma } = await import('../src/generated/prisma/client.js')
  product.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: 'test',
  }))

  const form = await app.request(editPath, { headers })
  expect(form.status).toBe(404)

  const save = await app.request(editPath, {
    method: 'POST',
    headers: { ...headers, origin },
    body: new URLSearchParams({ ...fields, active: 'true' }),
  })
  expect(save.status).toBe(404)
})
