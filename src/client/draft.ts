import type { DraftComment, ReviewEvent } from '../shared/types.js'

export interface Draft {
  version: 1
  /** Branch where the reviewer started the draft. */
  branch: string | null
  summary: string
  event: ReviewEvent
  comments: DraftComment[]
}

const KEY = 'vitepress-doc-review:draft'

export function emptyDraft(): Draft {
  return { version: 1, branch: null, summary: '', event: 'COMMENT', comments: [] }
}

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyDraft()
    const d = JSON.parse(raw) as Draft
    if (d?.version !== 1 || !Array.isArray(d.comments)) return emptyDraft()
    return { ...emptyDraft(), ...d }
  } catch {
    return emptyDraft()
  }
}

export function saveDraft(d: Draft): void {
  try {
    if (!d.comments.length && !d.summary.trim()) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(d))
  } catch {}
}
