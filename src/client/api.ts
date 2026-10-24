import type { PrStatus, SubmitRequest, SubmitResponse } from '../shared/types.js'

const HEADERS = { 'X-Doc-Review': '1' }

/** Returns null when the dev server has no review endpoints (the plugin is off). */
export async function fetchStatus(): Promise<PrStatus | null> {
  const res = await fetch('/__review/pr', { headers: HEADERS, cache: 'no-store' })
  if (res.status === 404) return null
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) return null
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
  return data as PrStatus
}

/** Agent mode: close the review without feedback. The `doc-review` command then stops. */
export async function dismissReview(): Promise<SubmitResponse> {
  const res = await fetch('/__review/dismiss', { method: 'POST', headers: HEADERS })
  try {
    return (await res.json()) as SubmitResponse
  } catch {
    return { ok: false, error: { code: 'http', message: `HTTP ${res.status}` } }
  }
}

export async function submitReview(req: SubmitRequest): Promise<SubmitResponse> {
  const res = await fetch('/__review/submit', {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  })
  try {
    return (await res.json()) as SubmitResponse
  } catch {
    return { ok: false, error: { code: 'http', message: `HTTP ${res.status}` } }
  }
}
