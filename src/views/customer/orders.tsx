import type { OrderStatus, RefundRequestStatus } from '../../generated/prisma/client.js'
import type { Order } from '../../store/orders.js'
import { refundRequestLabels } from '../refundRequestLabels.js'
import { CustomerLayout } from './layout.js'

export type Purchase = {
  id: string
  productName: string
  status: OrderStatus
  amount: number
  quantity: number
  createdAt: Date
  paymentIntentId: string | null
  items: Order['items']
  refundRequest: { status: RefundRequestStatus; reason: string; rejectionNote: string | null } | null
}

const orderDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

const orderMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const PurchaseOrder = ({ order, open }: { order: Purchase; open: boolean }) => {
  const items = order.items?.length ? order.items.map((item) => ({
    id: item.productId, name: item.productName, quantity: item.quantity, amount: item.unitPrice * item.quantity,
  })) : [{ id: order.id, name: order.productName, quantity: order.quantity, amount: order.amount }]
  const refundLabel = order.refundRequest
    ? refundRequestLabels[order.refundRequest.status]
    : order.status === 'paid' && order.paymentIntentId ? 'Request refund' : undefined

  return (
    <li>
      <details class="purchase-order" open={open}>
        <summary class="purchase-summary">
          <span class="purchase-heading">
            <strong>{order.productName}</strong>
            <span class="purchase-meta">
              <span>Order #{order.id.slice(0, 8)}</span>
              <time datetime={order.createdAt.toISOString()}>{orderDate.format(order.createdAt)}</time>
            </span>
            <span class="purchase-status" data-status={order.status}>{order.status}</span>
          </span>
          <span class="purchase-total">
            <span>Total</span>
            <strong>{orderMoney.format(order.amount / 100)}</strong>
          </span>
        </summary>
        <div class="purchase-details">
          <ul class="purchase-items" aria-label="Order items" role="list">
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>Qty {item.quantity}</span>
                <strong>{orderMoney.format(item.amount / 100)}</strong>
              </li>
            ))}
          </ul>
          {refundLabel && (
            <a class="purchase-action" data-customer-link href={`/account/orders/${encodeURIComponent(order.id)}/refund`}>{refundLabel}</a>
          )}
        </div>
      </details>
    </li>
  )
}

export const AccountOrders = ({ orders, search, sort }: {
  orders: Purchase[]
  search: string
  sort: 'newest' | 'oldest'
}) => (
  <CustomerLayout title="Purchase history" tab="orders">
    <section aria-labelledby="purchase-history-title">
      <header class="purchase-toolbar">
        <h1 id="purchase-history-title">Purchase history</h1>
        <form method="get" action="/account/orders" role="search" data-customer-search>
          <input type="search" name="q" aria-label="Search orders" placeholder="Search orders" value={search} maxlength={120} />
          <select name="sort" aria-label="Sort orders">
            <option value="newest" selected={sort === 'newest'}>Newest first</option>
            <option value="oldest" selected={sort === 'oldest'}>Oldest first</option>
          </select>
          <button type="submit">Apply</button>
        </form>
      </header>
      {orders.length === 0 ? (
        <div class="purchase-empty">
          <p>{search ? 'No orders match your search.' : 'Your orders will appear here when you check out while signed in.'}</p>
          <a class="purchase-action" data-customer-link={search ? "" : undefined} href={search ? `/account/orders?sort=${sort}` : '/'}>{search ? 'Clear search' : 'Browse products'}</a>
        </div>
      ) : (
        <ul class="purchase-list" role="list">
          {orders.map((order, index) => <PurchaseOrder key={order.id} order={order} open={index === 0} />)}
        </ul>
      )}
    </section>
  </CustomerLayout>
)
