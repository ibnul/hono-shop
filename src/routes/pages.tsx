import { Hono } from 'hono'
import { z } from 'zod'
import { validate  } from '../lib/validate.js'
import { stripe, createCheckoutSession } from '../lib/stripe.js'
import { products } from "../data/products.js"
import { orders, createOrder } from '../store/orders.js'
import { ProductList } from "../views/productList.js"
import { Layout } from "../views/layout.js"
import { Success } from '../views/success.js'

const buySchema = z.object({
    quantity: z.coerce.number().int().min(1).max(10),
})

const app = new Hono()

app.get('/', (c) => {
    return c.html(
        <Layout title="Hono Shop">
            <ProductList products={products} />
        </Layout>,
    )
})

app.post('/buy/:productId', validate('form', buySchema), async (c) => {
    const { quantity } = c.req.valid('form')
    const order = createOrder(c.req.param('productId'), quantity)
    const session = await createCheckoutSession(order)

    return c.redirect(session.url!, 303)
})

app.get('/success', async (c) => {
    const sessionId = c.req.query('session_id')
    if(!sessionId) {
        return c.redirect('/')
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const order = orders.get(session.metadata?.orderId ?? '')

    return c.html(
        <Layout title="Payment Received">
            <Success session={session} order={order} />
        </Layout>,
    )
})

app.get('/cancel', (c) => {
    return c.html(
        <Layout title="Payment Cancelled">
            <section class="card">
                <h1>Payment Cancelled</h1>
                <p>No money charged. You can try again later.</p>
                <a href="/" class="btn">Back to shop</a>
            </section>
        </Layout>,
    )
})

export default app