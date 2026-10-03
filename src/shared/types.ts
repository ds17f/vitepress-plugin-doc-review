/** A range of new-side ("RIGHT") lines in one diff hunk. Both ends are inclusive. */
export interface Hunk {
  start: number
  end: number
}

/** Commentable lines per file path (relative to the git root). `null` means "unknown: allow all". */
export type Commentable = Record<string, Hunk[]> | null

export type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'

/** A comment as the browser sends it to the dev server. */
export interface DraftComment {
  id: string
  path: string
  /** Last line of the range (1-based). */
  line: number
  /** First line of a multi-line range. Not set for a single-line comment. */
  startLine?: number
  body: string
  /** The selected text, quoted in the posted comment. */
  quote?: string
  /** Route of the page where the reviewer made the comment. */
  page?: string
}

export interface SubmitRequest {
  event: ReviewEvent
  body: string
  comments: DraftComment[]
}

export type ProblemCode =
  | 'gh-missing'
  | 'gh-auth'
  | 'no-pr'
  | 'no-repo'
  | 'not-git'
  | 'gh-error'

export interface Problem {
  code: ProblemCode
  message: string
}

export interface Warning {
  code: 'head-mismatch' | 'dirty-docs' | 'no-head'
  message: string
}

export interface PrInfo {
  number: number
  url: string
  headRefOid: string
}

/** Response of `GET /__review/pr`. */
export interface PrStatus {
  dryRun: boolean
  repo: string | null
  branch: string | null
  pr: PrInfo | null
  commentable: Commentable
  warnings: Warning[]
  problem: Problem | null
  /** True when the reviewer can submit now. */
  canSubmit: boolean
}

export interface GitHubReviewComment {
  path: string
  body: string
  line: number
  side: 'RIGHT'
  start_line?: number
  start_side?: 'RIGHT'
}

export interface GitHubReviewPayload {
  commit_id: string
  event: ReviewEvent
  body?: string
  comments: GitHubReviewComment[]
}

/** Response of `POST /__review/submit`. */
export interface SubmitResponse {
  ok: boolean
  dryRun?: boolean
  payload?: GitHubReviewPayload
  /** Number of comments that went into the review body because they are outside the diff. */
  outsideDiff?: number
  url?: string
  error?: { code: string; message: string }
}
