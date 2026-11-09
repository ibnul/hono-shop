import { Hono } from 'hono'
import { stripe, syncPaymentRefund } from '../lib/stripe.js'
import type Stripe from 'stripe'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'

const app = new Hono()

app.post('/', async (c) => {
    const signature = c.req.header('stripe-signature')
    if(!signature) {
        return c.text('Missing stripe-signature header', 400)
    }

    const body = await c.req.text()

    let event: Stripe.Event
    try {
        event =await stripe.webhooks.constructEventAsync(
            body,
            signature,
            env.STRIPE_WEBHOOK_SECRET
        )
    } catch (err){
        console.error('Webhook signature failed: ', (err as Error).message)
        return c.text('Invalid signature', 400)
    }

    switch (event.type){
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
            const session = event.data.object
            const orderId = session.metadata?.orderId
            const paymentIntentId = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id

            if (!orderId || !paymentIntentId || session.payment_status !== 'paid' ||
                session.amount_total === null || session.currency !== 'usd') break

            await prisma.order.updateMany({
                where: {
                    id: orderId,
                    status: 'pending',
                    amount: session.amount_total,
                    OR: [{ sessionId: session.id }, { sessionId: null }],
                },
                data: { status: 'paid', paymentIntentId, sessionId: session.id },
            })
            break
        }

        case 'charge.refunded': {
            const charge = event.data.object

            const paymentIntentId = typeof charge.payment_intent === 'string'
                ? charge.payment_intent
                : charge.payment_intent?.id

            if (!paymentIntentId || !charge.refunded) break

            await syncPaymentRefund(paymentIntentId)
            break
        }

        case 'refund.created':
        case 'refund.updated': {
            const refund = event.data.object
            const paymentIntentId = typeof refund.payment_intent === 'string'
                ? refund.payment_intent
                : refund.payment_intent?.id

            if (paymentIntentId && refund.status === 'succeeded') {
                await syncPaymentRefund(paymentIntentId)
            }
            break
        }

        
    }
    


    return c.text('ok', 200)
})

export default app
