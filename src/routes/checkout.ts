import { Hono } from 'hono'
import { getCustomerSession } from '../lib/auth.js'
import { z } from 'zod'
import { HTTPException } from "hono/http-exception"
import { validate  } from '../lib/validate.js'
import { createCheckoutSession } from '../lib/stripe.js'
import { findOrder } from '../store/orders.js'


const checkoutSchema = z.object({
    orderId: z.string(),
})

const app = new Hono()

app.post('/', validate('json', checkoutSchema), async (c) => {
    const { orderId } = c.req.valid('json')
    const order = await findOrder(orderId)

    const customerSession = order?.userId ? await getCustomerSession(c.req.raw.headers) : null
    if (!order || (order.userId && order.userId !== customerSession?.user.id)) {
        throw new HTTPException(404, {message: 'Order not found'})
    }

    if (order.status !== 'pending'){
        throw new HTTPException(409, {message: 'Order is already paid'})
    }

    const session = await createCheckoutSession(order)

    return c.json({url: session.url })
})

export default app
