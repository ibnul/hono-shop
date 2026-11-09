import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
    APP_URL: z.url({ protocol: /^https?$/ })
        .transform((value) => new URL(value))
        .refine((url) => url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash,
            'APP_URL must be an HTTP or HTTPS origin')
        .transform((url) => url.origin),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    ADMIN_TOKEN: z.string().min(16),
    ENABLE_LOCAL_ADMIN: z.enum(['true', 'false']).default('false'),
    TRUST_LOCAL_HTTPS_PROXY: z.enum(['true', 'false']).default('false'),
    ENABLE_HTTPS_ADMIN: z.enum(['true', 'false']).default('false'),
    BETTER_AUTH_SECRET: z.string().min(32).optional()
}).superRefine((config, ctx) => {
    if (config.TRUST_LOCAL_HTTPS_PROXY === 'true' && !config.APP_URL.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'The HTTPS proxy requires an HTTPS APP_URL' })
    }
    if (config.ENABLE_HTTPS_ADMIN === 'true') {
        if (config.TRUST_LOCAL_HTTPS_PROXY !== 'true') {
            ctx.addIssue({ code: 'custom', path: ['ENABLE_HTTPS_ADMIN'], message: 'HTTPS admin requires TRUST_LOCAL_HTTPS_PROXY=true' })
        }
        if (config.ADMIN_TOKEN.length < 32) {
            ctx.addIssue({ code: 'custom', path: ['ADMIN_TOKEN'], message: 'HTTPS admin requires at least 32 characters' })
        }
    }
})

export const env = envSchema.parse(process.env)

const hostname = new URL(env.APP_URL).hostname
const loopbackHostname = ['localhost', '127.0.0.1'].includes(hostname) ? hostname : undefined
const localAdminHostname =
    env.ENABLE_LOCAL_ADMIN === 'true' ? loopbackHostname : undefined
const localAccountHostname = env.BETTER_AUTH_SECRET ? loopbackHostname : undefined

export const trustLocalHttpsProxy = env.TRUST_LOCAL_HTTPS_PROXY === 'true'
export const adminEnabled = Boolean(localAdminHostname) || env.ENABLE_HTTPS_ADMIN === 'true'
export const accountsEnabled = Boolean(localAccountHostname) || (trustLocalHttpsProxy && Boolean(env.BETTER_AUTH_SECRET))
export const listenHostname = trustLocalHttpsProxy ? '127.0.0.1' : localAdminHostname ?? localAccountHostname
