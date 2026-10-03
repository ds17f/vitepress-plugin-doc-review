import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadContext, postReview } from '../src/node/github.js'

// A fake `gh` on PATH. It answers the calls that the plugin makes and logs
// its arguments and stdin, so no request goes to GitHub.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
const log = (entry) => fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(entry) + '\\n')
const out = (v) => process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v))
if (args[0] === 'repo' && args[1] === 'view') out('octo/docs\\n')
else if (args[0] === 'pr' && args[1] === 'view') out({ number: 7, url: 'https://github.com/octo/docs/pull/7', headRefOid: process.env.FAKE_HEAD, state: 'OPEN' })
else if (args[0] === 'api' && args[1] === 'repos/octo/docs/pulls/7/files') out([[{ filename: 'docs/a.md', status: 'modified', patch: '@@ -1,2 +1,3 @@\\n # A\\n+new\\n text' }]])
else if (args[0] === 'api' && args.includes('POST')) {
  let input = ''
  process.stdin.on('data', (c) => (input += c))
  process.stdin.on('end', () => { log({ args, input }); out({ html_url: 'https://github.com/octo/docs/pull/7#pullrequestreview-1' }) })
} else { process.stderr.write('unexpected: ' + args.join(' ')); process.exit(1) }
`

let dir: string
let bin: string
let logFile: string
let head: string
const oldPath = process.env.PATH

const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

beforeAll(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'doc-review-gh-')))
  bin = path.join(dir, '.bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'gh'), FAKE_GH, { mode: 0o755 })
  logFile = path.join(dir, 'gh.log')
  process.env.FAKE_GH_LOG = logFile
  process.env.PATH = `${bin}${path.delimiter}${oldPath}`

  fs.mkdirSync(path.join(dir, 'docs'))
  fs.writeFileSync(path.join(dir, 'docs/a.md'), '# A\nnew\ntext\n')
  fs.writeFileSync(path.join(dir, '.gitignore'), '.bin\ngh.log\n')
  git('init', '-q', '-b', 'feature')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init')
  head = git('rev-parse', 'HEAD')
})

afterAll(() => {
  process.env.PATH = oldPath
})

const opts = () => ({ gitRoot: dir, srcDir: path.join(dir, 'docs'), dryRun: false })

describe('loadContext with a fake gh', () => {
  it('marks the diff as unknown and blocks the submit when there is no PR', async () => {
    const ctx = await loadContext({ ...opts(), gitRoot: null })
    expect(ctx.pr).toBeNull()
    expect(ctx.problem?.code).toBe('not-git')
    expect(ctx.commentable).toBeNull()
    expect(ctx.canSubmit).toBe(false)
  })

  it('finds the PR and the commentable lines', async () => {
    process.env.FAKE_HEAD = head
    const ctx = await loadContext(opts())
    expect(ctx.problem).toBeNull()
    expect(ctx.repo).toBe('octo/docs')
    expect(ctx.branch).toBe('feature')
    expect(ctx.pr).toEqual({ number: 7, url: 'https://github.com/octo/docs/pull/7', headRefOid: head })
    expect(ctx.commentable).toEqual({ 'docs/a.md': [{ start: 1, end: 3 }] })
    expect(ctx.warnings).toEqual([])
    expect(ctx.canSubmit).toBe(true)
  })

  it('blocks the submit when HEAD is not the PR head', async () => {
    process.env.FAKE_HEAD = 'f'.repeat(40)
    const ctx = await loadContext(opts())
    expect(ctx.warnings.map((w) => w.code)).toEqual(['head-mismatch'])
    expect(ctx.canSubmit).toBe(false)
  })

  it('blocks the submit when a docs file has changes that are not committed', async () => {
    process.env.FAKE_HEAD = head
    fs.appendFileSync(path.join(dir, 'docs/a.md'), 'more\n')
    fs.writeFileSync(path.join(dir, 'docs/new.md'), '# New\n')
    try {
      const ctx = await loadContext(opts())
      expect(ctx.warnings.map((w) => w.code)).toEqual(['dirty-docs'])
      expect(ctx.warnings[0].message).toContain('docs/a.md')
      expect(ctx.warnings[0].message).toContain('docs/new.md')
      expect(ctx.canSubmit).toBe(false)
      // In dry-run mode the warning shows, but the payload can still be checked.
      expect((await loadContext({ ...opts(), dryRun: true })).canSubmit).toBe(true)
    } finally {
      git('checkout', '--', 'docs/a.md')
      fs.rmSync(path.join(dir, 'docs/new.md'))
    }
  })
})

describe('postReview with a fake gh', () => {
  it('sends the payload on stdin with an argument array', async () => {
    fs.rmSync(logFile, { force: true })
    const payload = {
      commit_id: head,
      event: 'COMMENT' as const,
      body: "Summary with 'quotes', $(subshell) and `backticks`",
      comments: [{ path: 'docs/a.md', line: 2, side: 'RIGHT' as const, body: 'x' }]
    }
    const res = await postReview(dir, 'octo/docs', 7, payload)
    expect(res.url).toBe('https://github.com/octo/docs/pull/7#pullrequestreview-1')
    const entry = JSON.parse(fs.readFileSync(logFile, 'utf8').trim())
    expect(entry.args).toEqual(['api', '--method', 'POST', 'repos/octo/docs/pulls/7/reviews', '--input', '-'])
    expect(JSON.parse(entry.input)).toEqual(payload)
  })
})
