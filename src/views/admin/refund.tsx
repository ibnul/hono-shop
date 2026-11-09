import type { Order } from '../../store/orders.js'
import { OrderItems } from '../orderItems.js'
import { AdminLayout } from './layout.js'

const backLink = (
  <a href="/admin/orders" class="mt-4 inline-block text-sm font-medium text-slate-700 underline">Back to orders</a>
)

export const RefundConfirmation = ({ order }: {
  order: Pick<Order, 'id' | 'productName' | 'amount' | 'items'>
}) => (
  <AdminLayout page="orders" title="Confirm refund">
    <section class="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 class="mt-0 mb-2 text-2xl font-bold text-slate-950">Confirm refund</h1>
      <p class="mt-0 text-sm text-slate-700">Stripe will refund the remaining refundable balance on this payment to the original payment method.</p>
      <dl class="my-5 grid gap-3 text-sm">
        <div><dt class="font-semibold">Product</dt><dd class="m-0">{order.productName}</dd></div>
        <div><dt class="font-semibold">Order ID</dt><dd class="m-0 wrap-anywhere">{order.id}</dd></div>
        <div><dt class="font-semibold">Original order total</dt><dd class="m-0">${(order.amount / 100).toFixed(2)}</dd></div>
      </dl>
      <OrderItems items={order.items} />
      <form method="post" action={`/admin/orders/${encodeURIComponent(order.id)}/refund`}>
        <button type="submit" class="cursor-pointer rounded-lg border-0 bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600">Confirm refund</button>
      </form>
      {backLink}
    </section>
  </AdminLayout>
)

export const RefundResult = ({ orderId, refundId, status }: { orderId: string; refundId: string; status: string | null }) => (
  <AdminLayout page="orders" title="Refund result">
    <section class="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 class="mt-0 mb-2 text-2xl font-bold text-slate-950">Refund result</h1>
      <p class="m-0 text-sm text-slate-700">Stripe status: <strong>{status ?? 'Unknown'}</strong></p>
      <p class="mt-1 text-sm text-slate-700">Refund ID: <span class="wrap-anywhere">{refundId}</span></p>
      <p class="text-sm text-slate-600">The order is marked Refunded once Stripe confirms the full amount.</p>
      <a href={`/admin/orders/${encodeURIComponent(orderId)}`} class="mr-4 inline-block text-sm font-medium text-slate-700 underline">View order details</a>
      {backLink}
    </section>
  </AdminLayout>
)
