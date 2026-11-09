import type { OrderStatus, RefundRequestStatus } from '../generated/prisma/client.js'
import { acceptedEvidenceTypes } from '../lib/refundEvidence.js'
import type { Order } from '../store/orders.js'
import { OrderItems } from './orderItems.js'
import { AccountLinks } from './account.js'
import { Layout } from './layout.js'

export const refundRequestLabels = {
  pending: 'Awaiting review',
  processing: 'Refund processing',
  approved: 'Refund approved',
  rejected: 'Refund rejected',
} satisfies Record<RefundRequestStatus, string>

type Purchase = {
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

export const AccountOrders = ({ orders }: { orders: Purchase[] }) => (
  <Layout title="Purchase history" showAccount>
    <section class="card">
      <h1>Purchase history</h1>
      <AccountLinks />
      {orders.length === 0 ? <p>Your orders will appear here when you check out while signed in.</p> : (
        <ul class="account-items">
          {orders.map((order) => (
            <li key={order.id}>
              <strong>{order.productName}</strong>
              <p>{orderDate.format(order.createdAt)} · Qty {order.quantity} · ${(order.amount / 100).toFixed(2)} · <span class="account-status">{order.status}</span></p>
              <OrderItems items={order.items} />
              {order.refundRequest || (order.status === 'paid' && order.paymentIntentId) ? (
                <a href={`/account/orders/${encodeURIComponent(order.id)}/refund`}>
                  {order.refundRequest ? refundRequestLabels[order.refundRequest.status] : 'Request refund'}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  </Layout>
)

export const CustomerRefund = ({ order, error, reason }: {
  order: Purchase
  error?: string
  reason?: string
}) => (
  <Layout title="Refund request" showAccount>
    <section class="card account-card">
      <h1>{order.refundRequest ? 'Refund request' : 'Request a refund'}</h1>
      <p><strong>{order.productName}</strong> · ${(order.amount / 100).toFixed(2)}</p>
      <OrderItems items={order.items} />
      {order.refundRequest ? (
        <>
          <p><strong>{refundRequestLabels[order.refundRequest.status]}</strong></p>
          <p class="account-details">{order.refundRequest.reason}</p>
          {order.refundRequest.rejectionNote && (
            <p class="account-details"><strong>Reason for rejection</strong><br />{order.refundRequest.rejectionNote}</p>
          )}
        </>
      ) : (
        <>
          {error && <p class="account-error" role="alert">{error}</p>}
          <form method="post" enctype="multipart/form-data" class="account-form">
            <label>Describe the defect and reason for the refund
              <textarea name="reason" rows={5} minlength={10} maxlength={2000} required>{reason}</textarea>
            </label>
            <label>Defect photo or short video
              <input type="file" name="evidence" accept={acceptedEvidenceTypes} aria-describedby="evidence-help" required />
            </label>
            <small id="evidence-help">Attach one JPEG, PNG, WebP, MP4, or MOV file up to 8 MB.</small>
            <button type="submit" class="btn">Submit refund request</button>
          </form>
        </>
      )}
      <p><a href="/account/orders">Back to purchase history</a></p>
    </section>
  </Layout>
)

export const WishlistButton = ({ productId, saved, returnTo }: {
  productId: string
  saved: boolean
  returnTo: 'shop' | 'wishlist'
}) => {
  const title = saved ? 'Remove from wishlist' : 'Save to wishlist'
  return (
    <form method="post" action={`/account/wishlist/${encodeURIComponent(productId)}`} data-wishlist class="wishlist-form">
      <input type="hidden" name="action" value={saved ? 'remove' : 'save'} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button type="submit" class="wishlist-heart" title={title} aria-label={title} aria-pressed={saved ? 'true' : 'false'}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
      </button>
    </form>
  )
}

export const Wishlist = ({ items }: {
  items: { product: { id: string; name: string; price: number; active: boolean } }[]
}) => (
  <Layout title="Wishlist" showAccount>
    <section class="card">
      <h1>Wishlist</h1>
      <AccountLinks />
      {items.length === 0 ? <p>Save products from the <a href="/">shop</a> to find them here.</p> : (
        <ul class="account-items">
          {items.map(({ product }) => (
            <li key={product.id}>
              <strong>{product.name}</strong>
              <p>{product.active ? `$${(product.price / 100).toFixed(2)}` : 'Currently unavailable'}</p>
              {product.active && (
                <form method="post" action={`/buy/${encodeURIComponent(product.id)}`}>
                  <input type="hidden" name="quantity" value="1" />
                  <button type="submit" class="btn">Buy now</button>
                </form>
              )}
              <WishlistButton productId={product.id} saved returnTo="wishlist" />
            </li>
          ))}
        </ul>
      )}
    </section>
  </Layout>
)
