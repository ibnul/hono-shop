import { prismaAdapter } from '@better-auth/prisma-adapter'
import { betterAuth } from 'better-auth'
import { accountsEnabled, env } from '../env.js'
import { prisma } from './prisma.js'

export const authOrigin = env.APP_URL
export const authBasePath = '/api/auth'
export const authIpHeader = 'x-hono-client-ip'

export const customerAuth = accountsEnabled && env.BETTER_AUTH_SECRET
  ? betterAuth({
      appName: 'Hono Shop',
      baseURL: authOrigin,
      basePath: authBasePath,
      secret: env.BETTER_AUTH_SECRET,
      database: prismaAdapter(prisma, { provider: 'mysql' }),
      emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
      session: { disableSessionRefresh: true },
      rateLimit: { enabled: true },
      advanced: {
        useSecureCookies: authOrigin.startsWith('https://'),
        ipAddress: { ipAddressHeaders: [authIpHeader] },
      },
    })
  : null

export async function getCustomerSession(headers: Headers) {
  return customerAuth ? customerAuth.api.getSession({ headers }) : null
}
