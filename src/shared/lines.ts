import type { Commentable, Hunk } from './types.js'

/** Return the hunk that contains `line`, if any. */
export function findHunk(hunks: Hunk[] | undefined, line: number): Hunk | undefined {
  return hunks?.find((h) => line >= h.start && line <= h.end)
}

/** True when any line in [start, end] is commentable. */
export function rangeTouchesDiff(commentable: Commentable, path: string, start: number, end: number): boolean {
  if (commentable === null) return true
  const hunks = commentable[path]
  return !!hunks?.some((h) => h.start <= end && h.end >= start)
}
