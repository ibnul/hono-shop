import { Prisma } from '../generated/prisma/client.js'
import { HTTPException } from "hono/http-exception"
import { prisma } from '../lib/prisma.js'

export const orderItemSelection = {
  select: { productId: true, productName: true, quantity: true, unitPrice: true },
  orderBy: { productId: 'asc' },
} as const

const orderFields = {
  id: true,
  userId: true,
  productId: true,
  productName: true,
  quantity: true,
  amount: true,
  status: true,
  sessionId: true,
  paymentIntentId: true,
  items: orderItemSelection,
} as const

export type Order = Awaited<ReturnType<typeof createOrder>>

export function findOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, select: orderFields })
}

export async function requireOrder(id: string) {
  const order = await findOrder(id)
  if (!order) {
    throw new HTTPException(404, { message: 'Order Not Found' })
  }

  return order
}

export async function findRefundableOrder(id: string) {
  const order = await requireOrder(id)
  const { paymentIntentId } = order
  if (order.status !== 'paid' || !paymentIntentId) {
    throw new HTTPException(409, { message: `Only paid orders can be refunded. Order id: ${order.id}` })
  }

  return { ...order, paymentIntentId }
}

export async function createOrder(productId: string, quantity: number, userId?: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId, active: true },
    select: { id: true, name: true, price: true },
  })

  if (!product) {
    throw new HTTPException(404, {
      message: 'Product not found',
    })
  }

  return prisma.order.create({
    data: {
      ...(userId && { userId }),
      productId: product.id,
      productName: product.name,
      quantity,
      amount: product.price * quantity,
    },
    select: orderFields,
  })
}

export async function createCartOrder(
  cartCheckoutKey: string,
  items: Order['items'],
  userId?: string,
) {
  const lookup = { where: { cartCheckoutKey }, select: orderFields }
  const existing = await prisma.order.findUnique(lookup)
  if (existing) return existing

  try {
    return await prisma.order.create({
      data: {
        cartCheckoutKey,
        ...(userId && { userId }),
        productId: items.length === 1 ? items[0].productId : null,
        productName: items.length === 1 ? items[0].productName : 'Cart order',
        quantity: items.reduce((total, item) => total + item.quantity, 0),
        amount: items.reduce((total, item) => total + item.quantity * item.unitPrice, 0),
        items: { create: items },
      },
      select: orderFields,
    })
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    return prisma.order.findUniqueOrThrow(lookup)
  }
}
