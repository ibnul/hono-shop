import type { RefundRequestStatus } from '../generated/prisma/client.js'

export const refundRequestLabels = {
  pending: 'Awaiting review',
  processing: 'Refund processing',
  approved: 'Refund approved',
  rejected: 'Refund rejected',
} satisfies Record<RefundRequestStatus, string>
