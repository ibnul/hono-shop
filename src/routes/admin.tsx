import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { env, trustLocalHttpsProxy } from '../env.js'
import { authIpHeader } from '../lib/auth.js'
import { AdminLogin } from '../views/admin/login.js'
import adminOrders from './adminOrders.js'
import adminProducts from './adminProducts.js'
import adminRefundRequests from './adminRefundRequests.js'

const admin = new Hono()
const home = '/admin/orders'
const adminPages = [home, '/admin/products', '/admin/refund-requests']
const secure = env.APP_URL.startsWith('https:')
const cookieName = secure ? '__Host-hono-admin' : 'hono-admin'
const cookieOptions = { path: '/', httpOnly: true, secure, sameSite: 'Strict' } as const
const sessionSeconds = 8 * 60 * 60
const sessions = new Map<string, number>()
const passwordHash = createHash('sha256').update(env.ADMIN_TOKEN).digest()
const loginAttempts = new Map<string, number>()
let loginWindowEndsAt = 0

function safeDestination(path?: string) {
  if (!path?.startsWith('/admin/')) return home
  const url = new URL(path, env.APP_URL)
  const allowed = adminPages.some((page) => url.pathname === page || url.pathname.startsWith(page + '/'))
  return allowed ? url.pathname + url.search : home
}

function hasSession(c: Context) {
  const token = getCookie(c, cookieName)
  if (!token) return false
  const expiresAt = sessions.get(token)
  if (expiresAt === undefined) return false
  if (expiresAt > Date.now()) return true
  sessions.delete(token)
  return false
}

function endSession(c: Context) {
  const token = getCookie(c, cookieName)
  if (token) sessions.delete(token)
}

const sameOrigin: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('Origin')
  // Referrer-Policy: no-referrer can make a browser form send Origin: null.
  const sameOriginWithoutOrigin =
    (!origin || origin === 'null') && c.req.header('Sec-Fetch-Site') === 'same-origin'
  if (origin !== env.APP_URL && !sameOriginWithoutOrigin) {
    return c.text('Forbidden', 403)
  }
  await next()
}

admin.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})

admin.get('/login', (c) => {
  const next = safeDestination(c.req.query('next'))
  if (hasSession(c)) return c.redirect(next, 303)
  return c.html(<AdminLogin next={next} />)
})

admin.post('/login', sameOrigin, bodyLimit({ maxSize: 8192 }), async (c) => {
  const form = await c.req.parseBody()
  const next = safeDestination(typeof form.next === 'string' ? form.next : undefined)
  // HTTPS proxy mode validates this Nginx-provided address before mounting admin.
  const ip = trustLocalHttpsProxy ? c.req.header(authIpHeader)! : '127.0.0.1'
  const now = Date.now()
  if (now >= loginWindowEndsAt) {
    loginAttempts.clear()
    loginWindowEndsAt = now + 60_000
  }
  const attempts = loginAttempts.get(ip)
  if ((attempts ?? 0) >= 5 || (attempts === undefined && loginAttempts.size >= 4096)) {
    c.header('Retry-After', String(Math.ceil((loginWindowEndsAt - now) / 1000)))
    return c.html(<AdminLogin next={next} error="Too many attempts. Try again in a minute." />, 429)
  }
  loginAttempts.set(ip, (attempts ?? 0) + 1)

  const password = typeof form.password === 'string' ? form.password : ''
  const validPassword = timingSafeEqual(createHash('sha256').update(password).digest(), passwordHash)
  if (form.username !== 'admin' || !validPassword) {
    return c.html(<AdminLogin next={next} error="Incorrect username or password." />, 401)
  }

  loginAttempts.delete(ip)
  endSession(c)
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token)
  }
  if (sessions.size >= 64) sessions.delete(sessions.keys().next().value!)

  const token = randomBytes(32).toString('base64url')
  sessions.set(token, now + sessionSeconds * 1000)
  setCookie(c, cookieName, token, { ...cookieOptions, maxAge: sessionSeconds })
  return c.redirect(next, 303)
})

admin.use('*', async (c, next) => {
  if (!hasSession(c)) {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.text('Admin sign-in required', 401)
    const url = new URL(c.req.url)
    const destination = safeDestination(url.pathname + url.search)
    return c.redirect('/admin/login?' + new URLSearchParams({ next: destination }), 303)
  }

  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()
  return sameOrigin(c, next)
})

admin.get('/', (c) => c.redirect(home, 303))
admin.post('/logout', (c) => {
  endSession(c)
  deleteCookie(c, cookieName, cookieOptions)
  return c.redirect('/admin/login', 303)
})

admin.route('/products', adminProducts)
admin.route('/orders', adminOrders)
admin.route('/refund-requests', adminRefundRequests)

export default admin
