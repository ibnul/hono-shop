import type { Order, OrderStatus } from '../../generated/prisma/client.js'
import type { Order as StoredOrder } from '../../store/orders.js'
import { OrderItems } from '../orderItems.js'
import { AdminLayout } from './layout.js'

type OrderRow = Pick<Order, 'id' | 'productName' | 'quantity' | 'amount' | 'status' | 'createdAt' | 'paymentIntentId'>

const statusLabel = {
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded',
} satisfies Record<OrderStatus, string>

const statusColor = {
  pending: 'bg-amber-50 text-amber-900',
  paid: 'bg-emerald-50 text-emerald-800',
  refunded: 'bg-slate-100 text-slate-700',
} satisfies Record<OrderStatus, string>

const orderDate = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

export const AdminOrders = ({ orders, status, limit }: {
  orders: OrderRow[]
  status: 'all' | OrderStatus
  limit: number
}) => (
  <AdminLayout page="orders" title="Manage orders">
    <header class="mb-6">
      <h1 class="mt-1 mb-2 text-3xl font-bold tracking-tight text-slate-950">Orders</h1>
      <p class="m-0 text-sm text-slate-600">View the latest {limit} orders for the selected status.</p>
    </header>

    <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action="/admin/orders" class="flex flex-wrap items-end gap-3 px-5 py-4 sm:px-6">
        <label class="block text-sm font-medium text-slate-800">
          Status
          <select name="status" class="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600">
            <option value="all" selected={status === 'all'}>All statuses</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value} selected={status === value}>{label}</option>
            ))}
          </select>
        </label>
        <button type="submit" class="cursor-pointer rounded-lg border-0 bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600">Filter</button>
      </form>

      {orders.length === 0 ? (
        <p class="m-0 border-t border-slate-200 px-5 py-6 text-sm text-slate-600 sm:px-6">No orders match this filter.</p>
      ) : (
        <div class="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-600" role="region" aria-label="Order results" tabindex={0}>
          <table class="w-full min-w-xl border-collapse text-left text-sm">
            <thead class="border-y border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" class="px-5 py-3 sm:px-6">Order</th>
                <th scope="col" class="px-4 py-3">Created (UTC)</th>
                <th scope="col" class="px-4 py-3 text-right">Qty</th>
                <th scope="col" class="px-4 py-3 text-right">Total</th>
                <th scope="col" class="px-5 py-3 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <th scope="row" class="px-5 py-3 text-left font-semibold text-slate-900 sm:px-6">
                    <a href={`/admin/orders/${encodeURIComponent(order.id)}`} class="text-slate-900 underline">{order.productName}</a>
                    <span class="block text-xs font-normal wrap-anywhere text-slate-600">{order.id}</span>
                  </th>
                  <td class="px-4 py-3 text-slate-700">
                    <time datetime={order.createdAt.toISOString()}>{orderDate.format(order.createdAt)}</time>
                  </td>
                  <td class="px-4 py-3 text-right text-slate-700 tabular-nums">{order.quantity}</td>
                  <td class="px-4 py-3 text-right whitespace-nowrap text-slate-900 tabular-nums">${(order.amount / 100).toFixed(2)}</td>
                  <td class="px-5 py-3 sm:px-6">
                    <span class={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[order.status]}`}>{statusLabel[order.status]}</span>
                    {order.status === 'paid' && order.paymentIntentId && (
                      <a
                        href={`/admin/orders/${encodeURIComponent(order.id)}/refund`}
                        class="mt-1 block text-sm font-medium text-orange-800 underline"
                      >
                        Refund
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </AdminLayout>
)

export const AdminOrderDetail = ({ order, refundChecked }: { order: StoredOrder; refundChecked: boolean }) => {
  const orderPath = `/admin/orders/${encodeURIComponent(order.id)}`
  const canCheckRefund = order.status === 'paid' && order.paymentIntentId

  return (
    <AdminLayout page="orders" title="Order details">
      <section class="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h1 class="mt-0 mb-2 text-2xl font-bold text-slate-950">Order details</h1>
        <p class="mt-0 wrap-anywhere text-sm text-slate-600">{order.id}</p>
        <dl class="my-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt class="font-semibold">Product</dt><dd class="m-0">{order.productName}</dd></div>
          <div><dt class="font-semibold">Quantity</dt><dd class="m-0">{order.quantity}</dd></div>
          <div><dt class="font-semibold">Total</dt><dd class="m-0">${(order.amount / 100).toFixed(2)}</dd></div>
          <div><dt class="font-semibold">Status</dt><dd class="m-0">{statusLabel[order.status]}</dd></div>
          <div class="sm:col-span-2">
            <dt class="font-semibold">Stripe payment reference</dt>
            <dd class="m-0 wrap-anywhere">{order.paymentIntentId ?? 'Awaiting payment'}</dd>
          </div>
        </dl>
        <OrderItems items={order.items} />
        {refundChecked && canCheckRefund && (
          <p role="status" class="text-sm text-slate-700">Stripe has yet to confirm a full refund. This order is still Paid.</p>
        )}
        {canCheckRefund && (
          <form method="post" action={`${orderPath}/sync-refund`}>
            <button type="submit" class="cursor-pointer rounded-lg border-0 bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600">Check Stripe refund status</button>
          </form>
        )}
        <a href="/admin/orders" class="mt-4 inline-block text-sm font-medium text-slate-700 underline">Back to orders</a>
      </section>
    </AdminLayout>
  )
}
