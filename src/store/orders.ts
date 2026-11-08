import { HTTPException } from "hono/http-exception"
import { prisma } from '../lib/prisma.js'

export type OrderStatus = "pending" | "paid" | "refunded"

export type Order = {
  id: string
  productId: string
  productName: string
  quantity: number
  amount: number
  status: OrderStatus
  sessionId?: string
  paymentIntentId?: string
}

export const orders = new Map<string, Order>()

export async function createOrder(productId: string, quantity: number) {
  const product = await prisma.product.findUnique({
    where: { id: productId, active: true },
    select: { id: true, name: true, price: true },
  })

  if (!product) {
    throw new HTTPException(404, {
      message: 'Product not found',
    })
  }

  const order: Order = {
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    quantity,
    amount: product.price * quantity,
    status: "pending",
  }

  orders.set(order.id, order)
  return order
}
