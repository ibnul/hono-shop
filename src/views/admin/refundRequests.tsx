import type { OrderStatus, RefundRequestStatus } from '../../generated/prisma/client.js'
import type { Order } from '../../store/orders.js'
import { OrderItems } from '../orderItems.js'
import { refundRequestLabels } from '../refundRequestLabels.js'
import { AdminLayout } from './layout.js'

type QueueItem = {
  id: string
  status: RefundRequestStatus
  createdAt: Date
  order: { productName: string; amount: number; user: { email: string } | null }
}

const requestPath = (id: string) => `/admin/refund-requests/${encodeURIComponent(id)}`
const submittedDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })
const actionButton = 'cursor-pointer rounded-lg border-0 bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600'

export const AdminRefundQueue = ({ requests }: { requests: QueueItem[] }) => (
  <AdminLayout page="refunds" title="Refund requests">
    <h1 class="mt-1 mb-4 text-3xl font-bold text-slate-950">Refund requests</h1>
    <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {requests.length === 0 ? (
        <p class="px-5 py-3 text-sm text-slate-600">There are no refund requests yet.</p>
      ) : (
        <div class="overflow-x-auto" role="region" aria-label="Refund requests" tabindex={0}>
          <table class="w-full min-w-md border-collapse text-left text-sm">
            <thead class="border-y border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" class="px-5 py-3">Order</th>
                <th scope="col" class="px-4 py-3">Submitted (UTC)</th>
                <th scope="col" class="px-4 py-3">Amount</th>
                <th scope="col" class="px-4 py-3">Status</th>
                <th scope="col" class="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              {requests.map((request) => (
                <tr key={request.id}>
                  <th scope="row" class="px-5 py-3 font-semibold">
                    {request.order.productName}
                    <span class="block text-xs font-normal text-slate-600">{request.order.user?.email ?? 'Account unavailable'}</span>
                  </th>
                  <td class="px-4 py-3">{submittedDate.format(request.createdAt)}</td>
                  <td class="px-4 py-3 whitespace-nowrap">${(request.order.amount / 100).toFixed(2)}</td>
                  <td class="px-4 py-3">{refundRequestLabels[request.status]}</td>
                  <td class="px-4 py-3"><a href={requestPath(request.id)} class="font-medium text-orange-800 underline">Review</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </AdminLayout>
)

type Review = Omit<QueueItem, 'order'> & {
  reason: string
  rejectionNote: string | null
  stripeRefundId: string | null
  evidence: { mimeType: string } | null
  order: QueueItem['order'] & { id: string; status: OrderStatus; paymentIntentId: string | null; items: Order['items'] }
}

export const AdminRefundReview = ({ request, refundError }: { request: Review; refundError: boolean }) => (
  <AdminLayout page="refunds" title="Review refund request">
    <p class="mt-0"><a href="/admin/refund-requests" class="text-sm font-medium text-slate-700 underline">Back to refund requests</a></p>
    <section class="max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 class="mt-0 mb-2 text-2xl font-bold text-slate-950">Review refund request</h1>
      <p class="text-sm text-slate-700">
        <a href={`/admin/orders/${encodeURIComponent(request.order.id)}`} class="underline">{request.order.productName}</a>
        {' · '}${(request.order.amount / 100).toFixed(2)}{' · '}{request.order.user?.email ?? 'Account unavailable'}
      </p>
      <p class="text-sm"><strong>{refundRequestLabels[request.status]}</strong> · Order {request.order.status}</p>
      <OrderItems items={request.order.items} />
      <h2 class="mb-1 text-base font-semibold">Customer’s description</h2>
      <p class="mt-0 wrap-anywhere whitespace-pre-wrap text-sm">{request.reason}</p>
      {request.evidence && (
        <EvidencePreview url={`${requestPath(request.id)}/evidence`} mimeType={request.evidence.mimeType} />
      )}

      {request.rejectionNote && <p class="wrap-anywhere whitespace-pre-wrap text-sm"><strong>Rejection reason</strong><br />{request.rejectionNote}</p>}
      {request.stripeRefundId && <p class="wrap-anywhere text-sm">Stripe refund reference {request.stripeRefundId}</p>}
      {refundError && <p role="alert" class="text-sm text-red-800">Stripe did not confirm this refund. Check its status or retry from this request.</p>}
      {(request.status === 'pending' || request.status === 'processing') && (
        <form method="post" action={`${requestPath(request.id)}/approve`} class="mt-5">
          <button type="submit" class={actionButton}>
            {request.order.status === 'refunded' ? 'Record as refunded' : request.status === 'processing' ? 'Check or retry refund' : 'Approve and refund'}
          </button>
        </form>
      )}
      {request.status === 'pending' && request.order.status === 'paid' && (
        <form method="post" action={`${requestPath(request.id)}/reject`} class="mt-5 border-t border-slate-200 pt-4">
          <label class="block text-sm font-medium">
            Rejection reason shown to the customer
            <textarea name="reason" rows={3} maxlength={500} required class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" class="mt-3 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">Reject request</button>
        </form>
      )}
    </section>
  </AdminLayout>
)


const evidenceButton = 'inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 no-underline hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600'

const EvidencePreview = ({ url, mimeType }: { url: string; mimeType: string }) => {
  const video = mimeType.startsWith('video/')
  const previewUrl = `${url}?preview=1`

  return (
    <>
      <div class="flex flex-wrap gap-2">
        <a href={previewUrl} id="open-evidence-preview" class={evidenceButton}>
          {video ? 'Preview video' : 'Preview photo'}
        </a>
        <a href={url} class={evidenceButton}>Download evidence</a>
      </div>
      <dialog
        id="evidence-preview"
        aria-labelledby="evidence-preview-title"
        class="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl backdrop:bg-slate-950/60 sm:p-6"
      >
        <div class="mb-4 flex items-center justify-between gap-4">
          <h2 id="evidence-preview-title" class="m-0 text-lg font-semibold">{video ? 'Defect video' : 'Defect photo'}</h2>
          <form method="dialog">
            <button type="submit" class={evidenceButton} autofocus>Close</button>
          </form>
        </div>
        {video ? (
          <video controls playsinline preload="none" data-evidence-src={previewUrl} class="mx-auto block max-h-[65vh] w-full rounded-lg bg-slate-950" />
        ) : (
          <img alt="Defect photo attached to this refund request" data-evidence-src={previewUrl} class="mx-auto block max-h-[65vh] max-w-full rounded-lg object-contain" />
        )}
        <p id="evidence-preview-error" role="status" hidden class="text-sm text-slate-700">
          Your browser couldn’t display this file. Use the download button to open it.
        </p>
        <a href={url} class={`mt-4 ${evidenceButton}`}>Download evidence</a>
      </dialog>
      <script src="/public/refund-evidence-preview.js" defer />
    </>
  )
}
