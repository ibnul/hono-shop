import Stripe from "stripe"
import { env } from '../env.js'
import { findRefundableOrder } from "../store/orders.js"
import type { Order } from "../store/orders.js"
import { prisma } from './prisma.js'

export const stripe = new Stripe( env.STRIPE_SECRET_KEY )

async function getStripeCustomer(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, stripeCustomerId: true },
    })
    if (user.stripeCustomerId) return user.stripeCustomerId

    const customer = await stripe.customers.create(
        { email: user.email },
        { idempotencyKey: `customer-${userId}` },
    )
    const saved = await prisma.user.updateMany({
        where: { id: userId, stripeCustomerId: null },
        data: { stripeCustomerId: customer.id },
    })
    if (saved.count) return customer.id

    const current = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { stripeCustomerId: true },
    })
    if (!current.stripeCustomerId) throw new Error('Stripe customer could not be saved')
    return current.stripeCustomerId
}

export async function createCheckoutSession(order: Order) {
    const customer = order.userId ? await getStripeCustomer(order.userId) : undefined
    const session = await stripe.checkout.sessions.create(
        {
            mode: 'payment',
            ...(customer && { customer }),
            line_items: (order.items?.length ? order.items : [{
                productName: order.productName,
                quantity: order.quantity,
                unitPrice: order.amount / order.quantity,
            }]).map((item) => ({
                quantity: item.quantity,
                price_data: {
                    currency: 'usd',
                    unit_amount: item.unitPrice,
                    product_data: { name: item.productName },
                },
            })),
            metadata: { orderId: order.id },
            success_url: `${env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${env.APP_URL}${order.items?.length ? '/cart' : '/cancel'}`,
        },
        {idempotencyKey: `checkout-${order.id}`}
    )
    
    await prisma.order.update({
        where: { id: order.id },
        data: { sessionId: session.id },
    })
    
    return session
}

type RefundablePayment = Pick<Order, 'id' | 'amount'> & { paymentIntentId: string }

function isCompletedUsdRefund(refund: Stripe.Refund) {
    return refund.status === 'succeeded' && refund.currency === 'usd'
}

function markOrderRefunded(order: RefundablePayment) {
    return prisma.$transaction([
        prisma.order.updateMany({
            where: { id: order.id, paymentIntentId: order.paymentIntentId, amount: order.amount, status: 'paid' },
            data: { status: 'refunded' },
        }),
        prisma.refundRequest.updateMany({
            where: { orderId: order.id, status: 'processing', order: { status: 'refunded' } },
            data: { status: 'approved' },
        }),
    ])
}

export async function syncOrderRefund(order: RefundablePayment) {
    let refundedAmount = 0
    for await (const refund of stripe.refunds.list({ payment_intent: order.paymentIntentId, limit: 100 })) {
        if (isCompletedUsdRefund(refund)) refundedAmount += refund.amount
    }

    if (refundedAmount > 0 && refundedAmount === order.amount) {
        await markOrderRefunded(order)
        return true
    }
    return false
}

export async function syncPaymentRefund(paymentIntentId: string) {
    const order = await prisma.order.findFirst({
        where: { paymentIntentId, status: 'paid' },
        select: { id: true, amount: true },
    })
    if (order) await syncOrderRefund({ ...order, paymentIntentId })
}

export async function refundOrder(orderId: string, idempotencyKey = `refund-${orderId}`) {
    const order = await findRefundableOrder(orderId)
    const refund = await stripe.refunds.create(
        { payment_intent: order.paymentIntentId },
        { idempotencyKey },
    )
    if (isCompletedUsdRefund(refund)) {
        if (refund.amount === order.amount) {
            await markOrderRefunded(order)
        } else {
            await syncOrderRefund(order)
        }
    }

    return refund
}
