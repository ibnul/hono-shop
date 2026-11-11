import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { authOrigin, getCustomerSession } from '../lib/auth.js'
import { cartQuantity, clearPurchasedCart, readCart } from '../lib/cart.js'
import { accountsEnabled } from '../env.js'
import { z } from 'zod'
import { validate  } from '../lib/validate.js'
import { stripe, createCheckoutSession } from '../lib/stripe.js'
import { prisma } from '../lib/prisma.js'
import { createOrder, findOrder } from '../store/orders.js'
import { ProductList } from "../views/productList.js"
import { Layout } from "../views/layout.js"
import { Success } from '../views/success.js'

const buySchema = z.object({
    quantity: z.coerce.number().int().min(1).max(10),
})

const app = new Hono()
const checkoutCsrf = csrf({ origin: authOrigin })

app.get('/', async (c) => {
    const customer = await getCustomerSession(c.req.raw.headers)
    const products = await prisma.product.findMany({
        where: { active: true },
        select: { id: true, name: true, description: true, price: true },
        orderBy: { id: 'asc' },
    })

    const saved = customer ? await prisma.wishlistItem.findMany({
        where: { userId: customer.user.id },
        select: { productId: true },
    }) : []
    c.header('Cache-Control', 'private, no-store')
    const accountNav = accountsEnabled ? (customer ? 'customer' : 'guest') : undefined

    return c.html(
        <Layout title="Hono Shop" accountNav={accountNav} cartCount={cartQuantity(readCart(c))}>
            <ProductList products={products} savedIds={customer ? new Set(saved.map((item) => item.productId)) : undefined} />
        </Layout>,
    )
})

app.post('/buy/:productId', validate('form', buySchema), async (c) => {
    const { quantity } = c.req.valid('form')
    const customer = await getCustomerSession(c.req.raw.headers)
    if (customer) await checkoutCsrf(c, async () => {})
    const order = await createOrder(c.req.param('productId'), quantity, customer?.user.id)
    const session = await createCheckoutSession(order)

    return c.redirect(session.url!, 303)
})

app.get('/success', async (c) => {
    const sessionId = c.req.query('session_id')
    if(!sessionId) {
        return c.redirect('/')
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const orderId = session.metadata?.orderId
    const order = orderId ? await findOrder(orderId) : null
    if (order?.userId) {
        const customer = await getCustomerSession(c.req.raw.headers)
        if (order.userId !== customer?.user.id) {
            throw new HTTPException(404, { message: 'Order not found' })
        }
    }
    if (order?.items?.length && order.sessionId === session.id && session.payment_status === 'paid'
        && session.amount_total === order.amount && session.currency === 'usd') {
        clearPurchasedCart(c, order.id, order.items)
    }
    c.header('Cache-Control', 'no-store')

    return c.html(
        <Layout title="Payment Received">
            <Success session={session} order={order ?? undefined} />
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
