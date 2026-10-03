import { describe, expect, it } from 'vitest'
import { commentableFromFiles, parsePatch } from '../src/node/diff.js'
import { rangeTouchesDiff } from '../src/shared/lines.js'

describe('parsePatch', () => {
  it('returns the new-side range of each hunk', () => {
    const patch = [
      '@@ -1,4 +1,5 @@',
      ' # Title',
      '-Old line',
      '+New line',
      '+Another new line',
      ' ',
      ' Text',
      '@@ -20,3 +21,4 @@ ## Section',
      ' a',
      '+b',
      ' c',
      ' d'
    ].join('\n')
    expect(parsePatch(patch)).toEqual([
      { start: 1, end: 5 },
      { start: 21, end: 24 }
    ])
  })

  it('handles a hunk header without counts and "No newline" markers', () => {
    const patch = '@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file'
    expect(parsePatch(patch)).toEqual([{ start: 1, end: 1 }])
  })

  it('handles a new file', () => {
    expect(parsePatch('@@ -0,0 +1,3 @@\n+a\n+b\n+c')).toEqual([{ start: 1, end: 3 }])
  })

  it('returns nothing for a hunk that only removes lines', () => {
    expect(parsePatch('@@ -5,2 +4,0 @@\n-a\n-b')).toEqual([])
  })

  it('returns nothing for a missing patch (binary or large file)', () => {
    expect(parsePatch(undefined)).toEqual([])
    expect(parsePatch('')).toEqual([])
  })

  it('handles CRLF patches', () => {
    expect(parsePatch('@@ -1,2 +1,2 @@\r\n a\r\n-b\r\n+c\r\n')).toEqual([{ start: 1, end: 2 }])
  })
})

describe('commentableFromFiles', () => {
  it('maps file names to hunks and skips removed files', () => {
    const map = commentableFromFiles([
      { filename: 'docs/a.md', status: 'modified', patch: '@@ -1,1 +1,2 @@\n a\n+b' },
      { filename: 'docs/gone.md', status: 'removed', patch: '@@ -1,1 +0,0 @@\n-a' },
      { filename: 'img.png', status: 'added' }
    ])
    expect(map).toEqual({ 'docs/a.md': [{ start: 1, end: 2 }] })
    expect(rangeTouchesDiff(map, 'docs/a.md', 2, 9)).toBe(true)
    expect(rangeTouchesDiff(map, 'docs/a.md', 3, 9)).toBe(false)
    expect(rangeTouchesDiff(map, 'docs/other.md', 1, 1)).toBe(false)
    expect(rangeTouchesDiff(null, 'docs/other.md', 1, 1)).toBe(true)
  })
})
