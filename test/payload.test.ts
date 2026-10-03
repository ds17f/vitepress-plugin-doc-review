import { describe, expect, it } from 'vitest'
import { buildIssuePayload, buildReviewPayload, lineLink, ReviewInputError } from '../src/node/payload.js'
import type { Commentable, DraftComment } from '../src/shared/types.js'

const sha = 'a'.repeat(40)
const commentable: Commentable = {
  'docs/guide.md': [
    { start: 1, end: 10 },
    { start: 30, end: 40 }
  ]
}
const c = (x: Partial<DraftComment>): DraftComment => ({ id: '1', path: 'docs/guide.md', line: 5, body: 'Fix this.', ...x })

describe('buildReviewPayload', () => {
  it('builds a single-line comment', () => {
    const { payload, outside } = buildReviewPayload({ commitId: sha, event: 'COMMENT', body: 'Summary', comments: [c({})], commentable })
    expect(outside).toEqual([])
    expect(payload).toEqual({
      commit_id: sha,
      event: 'COMMENT',
      body: 'Summary',
      comments: [{ path: 'docs/guide.md', line: 5, side: 'RIGHT', body: 'Fix this.' }]
    })
  })

  it('builds a multi-line comment with start_line and quotes the selection', () => {
    const { payload } = buildReviewPayload({
      commitId: sha,
      event: 'COMMENT',
      body: '',
      comments: [c({ startLine: 3, line: 6, quote: 'first line\nsecond line' })],
      commentable
    })
    expect(payload.comments[0]).toEqual({
      path: 'docs/guide.md',
      start_line: 3,
      start_side: 'RIGHT',
      line: 6,
      side: 'RIGHT',
      body: '> first line\n> second line\n\nFix this.'
    })
    expect(payload.body).toBeUndefined()
  })

  it('moves a comment outside the diff to the review body as path:line: comment', () => {
    const { payload, outside } = buildReviewPayload({
      commitId: sha,
      event: 'COMMENT',
      body: 'Looks good.',
      comments: [c({ line: 20, body: 'Typo here.' }), c({ id: '2', startLine: 15, line: 18, body: 'Two\nlines.' }), c({ id: '3', path: 'docs/other.md', line: 2 })],
      commentable
    })
    expect(payload.comments).toEqual([])
    expect(outside.map((o) => o.id)).toEqual(['1', '2', '3'])
    expect(payload.body).toBe(
      'Looks good.\n\n---\n\nComments on lines outside the diff:\n\n' +
        '- docs/guide.md:20: Typo here.\n' +
        '- docs/guide.md:15-18: Two\n  lines.\n' +
        '- docs/other.md:2: Fix this.'
    )
  })

  it('shrinks a range that only partly overlaps the diff to one hunk', () => {
    const { payload } = buildReviewPayload({ commitId: sha, event: 'COMMENT', body: '', comments: [c({ startLine: 8, line: 35 })], commentable })
    expect(payload.comments[0]).toMatchObject({ start_line: 30, line: 35 })
    expect(payload.comments[0].body).toContain('docs/guide.md:8-35')
  })

  it('allows all lines when commentable lines are unknown (dry run without a PR)', () => {
    const { payload, outside } = buildReviewPayload({ commitId: sha, event: 'APPROVE', body: '', comments: [c({ line: 999 })], commentable: null })
    expect(outside).toEqual([])
    expect(payload.comments[0].line).toBe(999)
  })

  it('rejects bad input', () => {
    const base = { commitId: sha, event: 'COMMENT' as const, body: 'x', commentable }
    expect(() => buildReviewPayload({ ...base, comments: [c({ path: '../etc/passwd' })] })).toThrow(ReviewInputError)
    expect(() => buildReviewPayload({ ...base, comments: [c({ line: 0 })] })).toThrow(ReviewInputError)
    expect(() => buildReviewPayload({ ...base, comments: [c({ startLine: 9, line: 5 })] })).toThrow(ReviewInputError)
    expect(() => buildReviewPayload({ ...base, comments: [c({ body: '  ' })] })).toThrow(ReviewInputError)
    expect(() => buildReviewPayload({ ...base, event: 'MERGE' as any, comments: [] })).toThrow(ReviewInputError)
    expect(() => buildReviewPayload({ ...base, commitId: 'HEAD; rm -rf /', comments: [] })).toThrow(ReviewInputError)
    expect(() => buildReviewPayload({ ...base, event: 'REQUEST_CHANGES', body: '', comments: [c({})] })).toThrow(/summary/)
    expect(() => buildReviewPayload({ ...base, body: '', comments: [] })).toThrow(/empty/)
  })
})

describe('buildIssuePayload', () => {
  const base = { repo: 'octo/docs', title: '', body: '', branch: 'feature', linkCommit: sha }

  it('puts the comments in file and line order, with links to the lines', () => {
    const { title, body } = buildIssuePayload({
      ...base,
      body: 'Overall good.',
      comments: [c({ id: '2', line: 30, startLine: 28, body: 'Second.', quote: 'Some text' }), c({ id: '1', path: 'docs/a b.md', line: 3, body: 'First.' })]
    })
    expect(title).toBe('Docs review: feature')
    expect(body.startsWith('Overall good.\n\n---\n\n## Comments')).toBe(true)
    const first = body.indexOf('### [docs/a b.md:3](https://github.com/octo/docs/blob/' + sha + '/docs/a%20b.md?plain=1#L3)')
    const second = body.indexOf('### [docs/guide.md:28-30](')
    expect(first).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(first)
    expect(body).toContain('> Some text\n\nSecond.')
    expect(body).toContain('branch `feature` at `aaaaaaa`')
  })

  it('has no links when HEAD is not pushed', () => {
    const { body } = buildIssuePayload({ ...base, linkCommit: null, comments: [c({})] })
    expect(body).toContain('### docs/guide.md:5\n')
    expect(body).not.toContain('https://')
    expect(body).toContain('(not pushed)')
  })

  it('uses the title from the reviewer', () => {
    expect(buildIssuePayload({ ...base, title: '  Fix   the guide ', comments: [c({})] }).title).toBe('Fix the guide')
  })

  it('rejects bad input', () => {
    expect(() => buildIssuePayload({ ...base, comments: [] })).toThrow(/empty/)
    expect(() => buildIssuePayload({ ...base, title: 'x'.repeat(300), comments: [c({})] })).toThrow(/title/)
    expect(() => buildIssuePayload({ ...base, comments: [c({ path: '../x.md' })] })).toThrow(ReviewInputError)
  })
})

describe('lineLink', () => {
  it('links one line or a range', () => {
    expect(lineLink('o/r', sha, 'docs/a.md', 4, 4)).toBe(`https://github.com/o/r/blob/${sha}/docs/a.md?plain=1#L4`)
    expect(lineLink('o/r', sha, 'docs/a.md', 2, 4)).toBe(`https://github.com/o/r/blob/${sha}/docs/a.md?plain=1#L2-L4`)
  })
})
