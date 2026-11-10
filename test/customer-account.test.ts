import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  user: [] as Array<Record<string, unknown>>,
  account: [] as Array<Record<string, unknown>>,
  session: [] as Array<Record<string, unknown>>,
  verification: [] as Array<Record<string, unknown>>,
}))

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    product: { findMany: vi.fn().mockResolvedValue([{ id: 'mug', name: 'Mug', description: 'Ceramic mug', price: 950 }]) },
    wishlistItem: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('@better-auth/prisma-adapter', async () => {
  const { memoryAdapter } = await import('better-auth/adapters/memory')
  return { prismaAdapter: () => memoryAdapter(database) }
})

const origin = 'http://localhost:3000'
const password = 'test-strong-password'
const customer = { name: 'Desk Shopper', email: 'SHOPPER@example.com', password }

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-only-0fd69daa79f34d458a8e159ad95bf947')
  for (const table of Object.values(database)) table.length = 0
})

afterEach(() => vi.unstubAllEnvs())

function form(values: Record<string, string>, headers?: HeadersInit) {
  return {
    method: 'POST',
    headers: { origin, ...headers },
    body: new URLSearchParams(values),
  }
}

function sessionCookie(response: Response) {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('better-auth.session_token='))
  expect(cookie).toContain('HttpOnly')
  expect(cookie).toContain('SameSite=Lax')
  return cookie!.split(';', 1)[0]
}

it('registers, signs out, and signs back in through the customer forms', async () => {
  vi.stubEnv('ENABLE_LOCAL_ADMIN', 'true')
  const { default: app } = await import('../src/app.js')

  for (const path of ['/', '/cart']) {
    const html = await (await app.request(path)).text()
    expect(html).toContain('href="/account/sign-in">Log in')
    expect(html).toContain('href="/account/register">Register')
    expect(html).not.toContain('href="/account">My account')
    expect(html).not.toContain('action="/account/wishlist/mug"')
  }

  const guest = await app.request('/account')
  expect(guest.headers.get('Location')).toBe('/account/sign-in')

  const registered = await app.request('/account/register', form(customer))
  expect(registered.status).toBe(303)
  expect(registered.headers.get('Location')).toBe('/account')
  const firstCookie = sessionCookie(registered)
  expect(database.account[0]?.password).toEqual(expect.any(String))
  expect(database.account[0]?.password).not.toBe(password)

  for (const path of ['/', '/cart']) {
    const html = await (await app.request(path, { headers: { cookie: firstCookie } })).text()
    expect(html).toContain('href="/account">My account')
    expect(html).not.toContain('href="/account/sign-in">Log in')
    expect(html).not.toContain('href="/account/register">Register')
    if (path === '/') expect(html).toContain('action="/account/wishlist/mug"')
  }

  const account = await app.request('/account', { headers: { cookie: firstCookie } })
  expect(account.status).toBe(200)
  expect(account.headers.get('Cache-Control')).toBe('no-store')
  const html = await account.text()
  expect(html).toContain('Desk Shopper')
  expect(html).toContain('shopper@example.com')
  expect((await app.request('/admin/orders', { headers: { cookie: firstCookie } })).status).toBe(303)

  const logout = await app.request('/account/sign-out', form({}, { cookie: firstCookie }))
  expect(logout.status).toBe(303)
  expect(logout.headers.get('Location')).toBe('/account/sign-in')
  expect((await app.request('/account', { headers: { cookie: firstCookie } })).status).toBe(302)

  const wrong = await app.request('/account/sign-in', form({ email: customer.email, password: 'wrong' }))
  expect(wrong.status).toBe(401)
  expect(wrong.headers.getSetCookie()).toHaveLength(0)

  const login = await app.request('/account/sign-in', form({ email: customer.email, password }))
  expect(login.status).toBe(303)
  const secondCookie = sessionCookie(login)
  expect(secondCookie).not.toBe(firstCookie)
  expect((await app.request('/account', { headers: { cookie: secondCookie } })).status).toBe(200)
})

it('blocks cross-origin registration and rejects short passwords', async () => {
  const { default: app } = await import('../src/app.js')
  const crossOrigin = await app.request('/account/register', form(customer, { origin: 'https://other.example.com' }))
  expect(crossOrigin.status).toBe(403)

  const short = await app.request('/account/register', form({ ...customer, password: 'short' }))
  expect(short.status).toBe(400)
  expect(database.user).toHaveLength(0)
})

it('keeps customer routes disabled without a secret or on a public URL without HTTPS proxy mode', async () => {
  vi.stubEnv('BETTER_AUTH_SECRET', undefined)
  const { default: disabledApp } = await import('../src/app.js')
  expect((await disabledApp.request('/account')).status).toBe(404)

  vi.resetModules()
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-only-0fd69daa79f34d458a8e159ad95bf947')
  vi.stubEnv('APP_URL', 'https://shop.example.com')
  const { default: publicApp } = await import('../src/app.js')
  expect((await publicApp.request('/account/register')).status).toBe(404)
  const shop = await (await publicApp.request('/')).text()
  expect(shop).not.toContain('href="/account/sign-in"')
  expect(shop).not.toContain('href="/account/register"')
})

it('sets a secure customer session and rate-limits sign-in by the proxy client IP', async () => {
  const origin = 'https://shop.example.com'
  vi.stubEnv('APP_URL', origin)
  vi.stubEnv('TRUST_LOCAL_HTTPS_PROXY', 'true')
  const { default: app } = await import('../src/app.js')
  const headers = { origin, 'x-forwarded-proto': 'https', 'x-hono-client-ip': '198.51.100.10' }
  const post = (path: string, values: Record<string, string>, extraHeaders?: HeadersInit) =>
    app.request(path, form(values, { ...headers, ...extraHeaders }))

  const registration = await post('/account/register', customer)
  expect(registration.status).toBe(303)
  const cookie = registration.headers.getSetCookie().find((value) =>
    value.startsWith('__Secure-better-auth.session_token='))
  expect(cookie).toContain('Secure')
  expect(cookie).toContain('HttpOnly')
  expect(cookie).toContain('SameSite=Lax')

  const account = await app.request('/account', { headers: { ...headers, cookie: cookie!.split(';', 1)[0] } })
  expect(account.status).toBe(200)
  expect(await account.text()).toContain('Desk Shopper')

  const login = { email: 'someone-else@example.com', password }
  let status: number = 401
  for (let attempt = 0; attempt < 10 && status === 401; attempt++) {
    status = (await post('/account/sign-in', login, { 'x-forwarded-for': `203.0.113.${attempt + 1}` })).status
  }
  expect(status).toBe(429)
  expect((await post('/account/sign-in', login, { 'x-hono-client-ip': '198.51.100.11' })).status).toBe(401)
})
