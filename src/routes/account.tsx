import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { z } from 'zod'
import { authBasePath, authOrigin, localAuthIpHeader } from '../lib/auth.js'
import type { customerAuth } from '../lib/auth.js'
import { AccountForm, AccountHome } from '../views/account.js'
import customerShop from './customerShop.js'

const email = z.email().max(191).transform((value) => value.toLowerCase())
const signInForm = z.object({ email, password: z.string().min(1).max(128) })
const registrationForm = signInForm.extend({
  name: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(128),
})

export function createAccountRoutes(auth: NonNullable<typeof customerAuth>) {
  const account = new Hono()

  account.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  const limitForm = bodyLimit({ maxSize: 8192 })
  account.use('*', csrf({ origin: authOrigin }))

  function submitAuth(c: Context, endpoint: string, body: object) {
    const headers = new Headers(c.req.raw.headers)
    headers.set('Content-Type', 'application/json')
    headers.delete('Content-Length')
    headers.set(localAuthIpHeader, '127.0.0.1')
    return auth.handler(new Request(`${authOrigin}${authBasePath}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }))
  }

  function redirectWithCookies(c: Context, result: Response, location: string) {
    for (const cookie of result.headers.getSetCookie()) {
      c.header('Set-Cookie', cookie, { append: true })
    }
    return c.redirect(location, 303)
  }

  account.get('/', async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.redirect('/account/sign-in')
    return c.html(<AccountHome user={session.user} />)
  })

  account.get('/register', (c) => c.html(<AccountForm registering />))
  account.get('/sign-in', (c) => c.html(<AccountForm registering={false} />))

  account.post('/register', limitForm, async (c) => {
    const form = registrationForm.safeParse(await c.req.parseBody())
    if (!form.success) {
      return c.html(<AccountForm registering error="Enter your name, a valid email, and a password with at least 12 characters." />, 400)
    }

    const result = await submitAuth(c, '/sign-up/email', form.data)
    if (result.status === 429) {
      return c.html(<AccountForm registering error="Too many attempts. Please try again shortly." />, 429)
    }
    if (!result.ok) {
      return c.html(<AccountForm registering error="We couldn’t create the account. Check your details and try again." />, result.status >= 500 ? 500 : 400)
    }

    return redirectWithCookies(c, result, '/account')
  })

  account.post('/sign-in', limitForm, async (c) => {
    const form = signInForm.safeParse(await c.req.parseBody())
    if (!form.success) {
      return c.html(<AccountForm registering={false} error="Enter a valid email and password." />, 400)
    }

    const result = await submitAuth(c, '/sign-in/email', form.data)
    if (result.status === 429) {
      return c.html(<AccountForm registering={false} error="Too many attempts. Please try again shortly." />, 429)
    }
    if (!result.ok) {
      const error = result.status >= 500 ? 'Sign-in is temporarily unavailable.' : 'The email or password is incorrect.'
      return c.html(<AccountForm registering={false} error={error} />, result.status >= 500 ? 500 : 401)
    }

    return redirectWithCookies(c, result, '/account')
  })

  account.post('/sign-out', limitForm, async (c) => {
    const result = await submitAuth(c, '/sign-out', {})
    if (!result.ok) return c.text('Sign-out failed. Please try again.', result.status === 429 ? 429 : 500)
    return redirectWithCookies(c, result, '/account/sign-in')
  })

  account.route('/', customerShop)
  return account
}
