import { HTTPException } from 'hono/http-exception'

export const maxEvidenceBytes = 8 * 1024 * 1024

const evidenceExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
}

export const acceptedEvidenceTypes = Object.keys(evidenceExtensions).join(',')

export async function readRefundEvidence(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    throw new HTTPException(400, { message: 'Attach a photo or short video of the defect.' })
  }
  if (file.size > maxEvidenceBytes) {
    throw new HTTPException(413, { message: 'Evidence must be 8 MB or smaller.' })
  }

  const content = Buffer.from(await file.arrayBuffer())
  const header = content.toString('hex', 0, 8)
  let mimeType: string | undefined
  if (header.startsWith('ffd8ff')) {
    mimeType = 'image/jpeg'
  } else if (header === '89504e470d0a1a0a') {
    mimeType = 'image/png'
  } else if (content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WEBP') {
    mimeType = 'image/webp'
  } else if (content.length >= 16 && content.toString('ascii', 4, 8) === 'ftyp') {
    const brand = content.toString('ascii', 8, 12)
    if (brand === 'qt  ') mimeType = 'video/quicktime'
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'hvc1', 'hev1', 'dash'].includes(brand)) {
      mimeType = 'video/mp4'
    }
  }

  if (!mimeType || (file.type && file.type !== 'application/octet-stream' && file.type !== mimeType)) {
    throw new HTTPException(400, { message: 'Choose a JPEG, PNG, WebP, MP4, or MOV file.' })
  }

  return { content, mimeType }
}

export function refundEvidenceResponse(
  evidence: { content: Uint8Array; mimeType: string },
  { preview = false, range }: { preview?: boolean; range?: string } = {},
) {
  if (!Object.hasOwn(evidenceExtensions, evidence.mimeType)) {
    throw new HTTPException(404, { message: 'Evidence not found' })
  }

  const extension = evidenceExtensions[evidence.mimeType]
  const content = new Uint8Array(evidence.content)
  const headers = new Headers({
    'Content-Type': evidence.mimeType,
    'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="refund-evidence.${extension}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  })

  if (preview && evidence.mimeType.startsWith('video/')) {
    headers.set('Accept-Ranges', 'bytes')
    const match = range?.match(/^bytes=(\d*)-(\d*)$/)
    if (match && (match[1] || match[2])) {
      const size = content.byteLength
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
      const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1

      if (start > end || start >= size) {
        headers.set('Content-Range', `bytes */${size}`)
        headers.set('Content-Length', '0')
        return new Response(null, { status: 416, headers })
      }

      headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
      headers.set('Content-Length', String(end - start + 1))
      return new Response(content.subarray(start, end + 1), { status: 206, headers })
    }
  }

  headers.set('Content-Length', String(content.byteLength))
  return new Response(content, { headers })
}
