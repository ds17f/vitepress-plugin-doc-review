import type { Hunk } from '../shared/types.js'

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/**
 * Parse a unified diff patch (the `patch` field of the GitHub "list pull
 * request files" API) and return the new-side line ranges, one per hunk.
 * GitHub accepts a review comment with `side: "RIGHT"` on any of these lines:
 * added lines and context lines.
 */
export function parsePatch(patch: string | undefined | null): Hunk[] {
  if (!patch) return []
  const hunks: Hunk[] = []
  let next = 0
  let start = 0
  let inHunk = false

  const close = () => {
    if (inHunk && next > start) hunks.push({ start, end: next - 1 })
    inHunk = false
  }

  for (const raw of patch.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const header = HUNK_HEADER.exec(line)
    if (header) {
      close()
      start = next = Number(header[1])
      inHunk = true
      continue
    }
    if (!inHunk) continue
    const mark = line[0]
    if (mark === '+' || mark === ' ') next++
    else if (mark === '-' || mark === '\\') continue
    // An empty string is the trailing split artifact or a stripped empty
    // context line. GitHub keeps the leading space, so ignore it.
  }
  close()
  return hunks
}

export interface PullFile {
  filename: string
  status?: string
  patch?: string
}

/** Build the commentable-line map from the GitHub "list pull request files" response. */
export function commentableFromFiles(files: PullFile[]): Record<string, Hunk[]> {
  const out: Record<string, Hunk[]> = {}
  for (const f of files) {
    if (f.status === 'removed') continue
    const hunks = parsePatch(f.patch)
    if (hunks.length) out[f.filename] = hunks
  }
  return out
}

export { findHunk, rangeTouchesDiff } from '../shared/lines.js'
