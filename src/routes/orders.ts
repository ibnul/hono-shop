import { Hono } from 'hono'
import { z } from 'zod'

import { orders, createOrder } from '../store/orders.js'
import { validate } from '../lib/validate.js'
import { HTTPException } from 'hono/http-exception'
import { bearerAuth } from 'hono/bearer-auth'
import { env } from '../env.js'
import { stripe } from '../lib/stripe.js'

const createOrderSchema = z.object({
    productId: z.string(),
    quantity: z.number().int().min(1).max(10)
})

const app = new Hono()

app.post('/', validate('json', createOrderSchema), async (c) => {
    const { productId, quantity } = c.req.valid('json')

    const order = await createOrder(productId, quantity)

    return c.json(order, 201)


})


app.get('/:id', (c) => {
    const order = orders.get(c.req.param('id'))
    if(!order) {
        throw new HTTPException(404, {message: 'Order not found'})
    }

    return c.json(order)
})

app.post('/:id/refund', bearerAuth({ token: env.ADMIN_TOKEN }), async (c) => {
    const order = orders.get(c.req.param('id'))

    if(!order) {
        throw new HTTPException(404, { message: 'Order Not Found'})
    }

    if ( order.status !== 'paid' || !order.paymentIntentId) {
        throw new HTTPException(409, { message: `Only paid orders can be refunded. Order id: ${order.id}`})
    }

    const refund = await stripe.refunds.create({ payment_intent: order.paymentIntentId })

    return c.json({ refundId: refund.id, status: refund.status})
})

export default app
