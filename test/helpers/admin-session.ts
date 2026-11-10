import type { Hono } from 'hono'
import { expect } from 'vitest'

export async function adminSessionHeaders(app: Hono) {
  const origin = 'http://localhost:3000'
  const login = await app.request('/admin/login', {
    method: 'POST',
    headers: { origin },
    body: new URLSearchParams({ username: 'admin', password: 'test-admin-token-123456' }),
  })
  expect(login.status).toBe(303)
  const cookie = login.headers.getSetCookie()[0]
  expect(cookie).toBeDefined()
  return { origin, cookie: cookie.split(';', 1)[0] }
}
