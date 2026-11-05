import { Hono } from 'hono'
import { z } from 'zod'

import { orders, createOrder } from '../store/orders.js'
import { validate } from '../lib/validate.js'
import { HTTPException } from 'hono/http-exception'

const createOrderSchema = z.object({
    productId: z.string(),
    quantity: z.number().int().min(1).max(10)
})

const app = new Hono()

app.post('/', validate('json', createOrderSchema), (c) => {
    //const body = await c.req.json()
    const { productId, quantity } = c.req.valid('json')

    const order = createOrder(productId, quantity)

    return c.json(order, 201)


})


app.get('/:id', (c) => {
    const order = orders.get(c.req.param('id'))
    if(!order) {
        throw new HTTPException(404, {message: 'Order not found'})
    }

    return c.json(order)
})

export default app