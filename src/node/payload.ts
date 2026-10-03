import type {
  Commentable,
  DraftComment,
  GitHubReviewComment,
  GitHubReviewPayload,
  ReviewEvent
} from '../shared/types.js'

export class ReviewInputError extends Error {}

const EVENTS: ReviewEvent[] = ['COMMENT', 'APPROVE', 'REQUEST_CHANGES']
const MAX_QUOTE = 300

export interface BuildPayloadInput {
  commitId: string
  event: ReviewEvent
  body: string
  comments: DraftComment[]
  /** `null` means "unknown": treat all lines as commentable (dry run without a PR). */
  commentable: Commentable
}

export interface BuildPayloadResult {
  payload: GitHubReviewPayload
  /** Comments that are outside the diff and went into the review body. */
  outside: DraftComment[]
}

function quoteBlock(text: string): string {
  let t = text.trim().replace(/\s+\n/g, '\n')
  if (t.length > MAX_QUOTE) t = t.slice(0, MAX_QUOTE).trimEnd() + '…'
  return t
    .split('\n')
    .map((l) => `> ${l}`.trimEnd())
    .join('\n')
}

/** The comment text as GitHub shows it: the quoted selection, then the comment. */
export function commentBody(c: Pick<DraftComment, 'body' | 'quote'>): string {
  const body = c.body.trim()
  return c.quote?.trim() ? `${quoteBlock(c.quote)}\n\n${body}` : body
}

function lineLabel(path: string, start: number | undefined, line: number): string {
  return start !== undefined && start !== line ? `${path}:${start}-${line}` : `${path}:${line}`
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? l : l ? prefix + l : l))
    .join('\n')
}

/**
 * Place one comment on the diff. Returns `null` when no line of the comment is in the diff.
 * A multi-line comment must stay inside one hunk. If the range only partly
 * overlaps the diff, the range shrinks to the overlap with the last hunk and the
 * comment tells the original range.
 */
function place(c: DraftComment, commentable: Commentable): GitHubReviewComment | null {
  const start = c.startLine ?? c.line
  const body = commentBody(c)
  if (commentable === null) return toGitHub(c.path, start, c.line, body)

  const hunks = commentable[c.path] ?? []
  const overlap = hunks.filter((h) => h.start <= c.line && h.end >= start)
  if (!overlap.length) return null
  const h = overlap[overlap.length - 1]
  const s = Math.max(start, h.start)
  const e = Math.min(c.line, h.end)
  if (s === start && e === c.line) return toGitHub(c.path, s, e, body)
  const note = `_(Comment on ${lineLabel(c.path, c.startLine, c.line)}. Only part of the range is in the diff.)_`
  return toGitHub(c.path, s, e, `${note}\n\n${body}`)
}

function toGitHub(path: string, start: number, line: number, body: string): GitHubReviewComment {
  const out: GitHubReviewComment = { path, body, line, side: 'RIGHT' }
  if (start < line) {
    out.start_line = start
    out.start_side = 'RIGHT'
  }
  return out
}

export function validateComment(c: unknown): asserts c is DraftComment {
  const x = c as DraftComment
  const posInt = (n: unknown) => Number.isInteger(n) && (n as number) > 0
  if (!x || typeof x !== 'object') throw new ReviewInputError('A comment is not an object.')
  if (typeof x.path !== 'string' || !x.path || x.path.startsWith('/') || x.path.split('/').includes('..'))
    throw new ReviewInputError(`Comment has a bad path: ${String(x.path)}`)
  if (!posInt(x.line)) throw new ReviewInputError(`Comment on ${x.path} has a bad line.`)
  if (x.startLine !== undefined && x.startLine !== null && (!posInt(x.startLine) || x.startLine > x.line))
    throw new ReviewInputError(`Comment on ${x.path}:${x.line} has a bad start line.`)
  if (typeof x.body !== 'string' || !x.body.trim())
    throw new ReviewInputError(`Comment on ${x.path}:${x.line} is empty.`)
  if (x.body.length > 60000) throw new ReviewInputError(`Comment on ${x.path}:${x.line} is too long.`)
  if (x.quote !== undefined && typeof x.quote !== 'string')
    throw new ReviewInputError(`Comment on ${x.path}:${x.line} has a bad quote.`)
}

/** Build the body of `POST /repos/{owner}/{repo}/pulls/{n}/reviews`. */
export function buildReviewPayload(input: BuildPayloadInput): BuildPayloadResult {
  if (!EVENTS.includes(input.event)) throw new ReviewInputError(`Unknown review event: ${String(input.event)}`)
  if (!/^[0-9a-f]{7,40}$/i.test(input.commitId)) throw new ReviewInputError('No commit ID for the review.')
  if (typeof input.body !== 'string') throw new ReviewInputError('The review summary must be a string.')
  if (!Array.isArray(input.comments)) throw new ReviewInputError('comments must be an array.')
  input.comments.forEach(validateComment)

  const comments: GitHubReviewComment[] = []
  const outside: DraftComment[] = []
  for (const c of input.comments) {
    const placed = place({ ...c, startLine: c.startLine ?? undefined }, input.commentable)
    if (placed) comments.push(placed)
    else outside.push(c)
  }

  let body = input.body.trim()
  if (outside.length) {
    const items = outside.map((c) => {
      const label = lineLabel(c.path, c.startLine ?? undefined, c.line)
      const quote = c.quote?.trim() ? `\n  ${indent(quoteBlock(c.quote), '  ')}` : ''
      return `- ${label}: ${indent(c.body.trim(), '  ')}${quote}`
    })
    const section = `Comments on lines outside the diff:\n\n${items.join('\n')}`
    body = body ? `${body}\n\n---\n\n${section}` : section
  }

  if (input.event === 'REQUEST_CHANGES' && !body)
    throw new ReviewInputError('"Request changes" needs a summary or a comment outside the diff.')
  if (input.event === 'COMMENT' && !body && !comments.length)
    throw new ReviewInputError('The review is empty. Add a summary or a comment.')

  const payload: GitHubReviewPayload = { commit_id: input.commitId, event: input.event, comments }
  if (body) payload.body = body
  return { payload, outside }
}
