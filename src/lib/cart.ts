import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { env } from '../env.js'

const cookieName = 'hono_shop_cart'
const maxCartItems = 20
const maxEncodedCartSize = 3500
export const maxCartQuantity = 10

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
  secure: new URL(env.APP_URL).protocol === 'https:',
} as const

const cartSchema = z.array(z.tuple([
  z.string().min(1).max(191).refine((id) => id.isWellFormed()),
  z.number().int().min(1).max(maxCartQuantity),
])).max(maxCartItems)

export function readCart(c: Context) {
  const value = getCookie(c, cookieName)
  if (value && value.length <= maxEncodedCartSize) {
    try {
      const cart = cartSchema.safeParse(JSON.parse(value))
      if (cart.success) return new Map(cart.data)
    } catch {
      // Ignore a malformed or outdated cart cookie.
    }
  }
  return new Map<string, number>()
}

export function writeCart(c: Context, cart: Map<string, number>) {
  if (!cart.size) {
    deleteCookie(c, cookieName, cookieOptions)
    return true
  }

  const value = JSON.stringify([...cart])
  if (cart.size > maxCartItems || encodeURIComponent(value).length > maxEncodedCartSize) {
    return false
  }
  setCookie(c, cookieName, value, cookieOptions)
  return true
}

export function cartQuantity(cart: Map<string, number>) {
  return [...cart.values()].reduce((count, quantity) => count + quantity, 0)
}

const checkoutCookie = 'hono_shop_cart_checkout'

export function rememberCartCheckout(c: Context, orderId: string) {
  setCookie(c, checkoutCookie, orderId, cookieOptions)
}

export function clearPurchasedCart(c: Context, orderId: string, items: { productId: string; quantity: number }[]) {
  if (getCookie(c, checkoutCookie) !== orderId) return
  deleteCookie(c, checkoutCookie, cookieOptions)

  const cart = readCart(c)
  if (cart.size === items.length && items.every((item) => cart.get(item.productId) === item.quantity)) {
    writeCart(c, new Map())
  }
}
