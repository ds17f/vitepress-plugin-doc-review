import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'docs/.vitepress/dist')

/**
 * Strings that only the review code contains. The docs text names the
 * endpoints and the attributes, so the check uses code names, CSS classes, and
 * real attributes (a name followed by "=").
 */
const MARKERS = ['doc-review-root', 'mountReview', 'targetFromSelection', '__docReviewSrc', 'dr-composer', 'dr-not-commentable', "'X-Doc-Review': '1'"]
const ATTRIBUTE = /data-source-(file|line|br)\b(=|\\?")|data-source-br>/

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

describe('production build of the docs site', () => {
  it('completes and contains no review UI and no /__review/ code', async () => {
    await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/vitepress/bin/vitepress.js'), 'build', 'docs'], { cwd: root })
    const files = walk(dist).filter((f) => /\.(html|js|css)$/.test(f))
    expect(files.some((f) => f.endsWith('testing/playground.html'))).toBe(true)
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8')
      for (const m of MARKERS) expect(text.includes(m), `${path.relative(root, f)} contains ${m}`).toBe(false)
      expect(ATTRIBUTE.exec(text)?.[0], `${path.relative(root, f)} has a source attribute`).toBeUndefined()
    }
  }, 120_000)
})
