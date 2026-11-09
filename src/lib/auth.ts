import { prismaAdapter } from '@better-auth/prisma-adapter'
import { betterAuth } from 'better-auth'
import { env, localAccountHostname } from '../env.js'
import { prisma } from './prisma.js'

export const authOrigin = new URL(env.APP_URL).origin
export const authBasePath = '/api/auth'
export const localAuthIpHeader = 'x-hono-local-auth-ip'

export const customerAuth = localAccountHostname && env.BETTER_AUTH_SECRET
  ? betterAuth({
      appName: 'Hono Shop',
      baseURL: authOrigin,
      basePath: authBasePath,
      secret: env.BETTER_AUTH_SECRET,
      database: prismaAdapter(prisma, { provider: 'mysql' }),
      emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
      session: { disableSessionRefresh: true },
      rateLimit: { enabled: true },
      advanced: { ipAddress: { ipAddressHeaders: [localAuthIpHeader] } },
    })
  : null

export async function getCustomerSession(headers: Headers) {
  return customerAuth ? customerAuth.api.getSession({ headers }) : null
}
