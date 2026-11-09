import { z } from 'zod'

const envSchema = z.object({
    APP_URL: z.url(),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    ADMIN_TOKEN: z.string().min(16),
    ENABLE_LOCAL_ADMIN: z.enum(['true', 'false']).default('false'),
    BETTER_AUTH_SECRET: z.string().min(32).optional()
})

export const env = envSchema.parse(process.env)

const hostname = new URL(env.APP_URL).hostname
const loopbackHostname = ['localhost', '127.0.0.1'].includes(hostname) ? hostname : undefined
export const localAdminHostname =
    env.ENABLE_LOCAL_ADMIN === 'true' ? loopbackHostname : undefined

export const localAccountHostname = env.BETTER_AUTH_SECRET ? loopbackHostname : undefined
