import { Hono } from 'hono'
import { getCustomerSession } from '../lib/auth.js'
import { z } from 'zod'

import { createOrder, findOrder } from '../store/orders.js'
import { validate } from '../lib/validate.js'
import { HTTPException } from 'hono/http-exception'
import { bearerAuth } from 'hono/bearer-auth'
import { env } from '../env.js'
import { refundOrder } from '../lib/stripe.js'

const createOrderSchema = z.object({
    productId: z.string(),
    quantity: z.number().int().min(1).max(10)
})

const app = new Hono()

app.post('/', validate('json', createOrderSchema), async (c) => {
    const { productId, quantity } = c.req.valid('json')

    const session = await getCustomerSession(c.req.raw.headers)
    const { userId: _owner, items: _items, ...order } = await createOrder(productId, quantity, session?.user.id)

    return c.json(order, 201)


})


app.get('/:id', async (c) => {
    const order = await findOrder(c.req.param('id'))
    const session = order?.userId ? await getCustomerSession(c.req.raw.headers) : null
    if (!order || (order.userId && order.userId !== session?.user.id)) {
        throw new HTTPException(404, { message: 'Order not found' })
    }

    if (order.userId) c.header('Cache-Control', 'no-store')
    const { userId: _owner, items, ...publicOrder } = order
    return c.json({ ...publicOrder, ...(items?.length && { items }) })
})

app.post('/:id/refund', bearerAuth({ token: env.ADMIN_TOKEN }), async (c) => {
    const refund = await refundOrder(c.req.param('id'))
    return c.json({ refundId: refund.id, status: refund.status})
})

export default app
