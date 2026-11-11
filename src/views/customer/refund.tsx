import { acceptedEvidenceTypes } from '../../lib/refundEvidence.js'
import { OrderItems } from '../orderItems.js'
import { refundRequestLabels } from '../refundRequestLabels.js'
import { CustomerLayout } from './layout.js'
import type { Purchase } from './orders.js'

export const CustomerRefund = ({ order, error, reason }: {
  order: Purchase
  error?: string
  reason?: string
}) => (
  <CustomerLayout title="Refund request" tab="orders">
    <section class="card">
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
      <p><a href="/account/orders" data-customer-link>Back to purchase history</a></p>
    </section>
  </CustomerLayout>
)
