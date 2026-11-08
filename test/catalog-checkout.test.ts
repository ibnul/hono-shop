import type Stripe from 'stripe'
import { expect, it, vi } from 'vitest'
import app from '../src/app.js'
import { stripe } from '../src/lib/stripe.js'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    product: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'mug',
        name: 'Database Mug',
        price: 1900,
      }),
    },
  },
}))

it('charges the catalog price recorded when the order was created', async () => {
  const stripeCreate = vi.spyOn(stripe.checkout.sessions, 'create')
    .mockResolvedValue({ id: 'cs_test_mock', url: 'https://checkout.stripe.com/test' } as Stripe.Response<Stripe.Checkout.Session>)

  try {
    const headers = { 'Content-Type': 'application/json' }
    const orderResponse = await app.request('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId: 'mug', quantity: 2 }),
    })

    expect(orderResponse.status).toBe(201)
    const order = await orderResponse.json()
    expect(order.amount).toBe(3800)

    const checkoutResponse = await app.request('/api/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId: order.id }),
    })

    expect(checkoutResponse.status).toBe(200)
    expect(stripeCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{
        quantity: 2,
        price_data: {
          currency: 'usd',
          unit_amount: 1900,
          product_data: { name: 'Database Mug' },
        },
      }],
    }), { idempotencyKey: `checkout-${order.id}` })
  } finally {
    stripeCreate.mockRestore()
  }
})
