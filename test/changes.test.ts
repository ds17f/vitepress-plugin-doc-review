import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeRegions, loadChanges } from '../src/node/changes.js'

let root: string
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const write = (file: string, text: string) => fs.writeFileSync(path.join(root, file), text)
const commit = (subject: string) => { git('add', '.'); git('commit', '-qm', subject); return git('rev-parse', 'HEAD') }
const opts = () => ({ gitRoot: root, srcDir: path.join(root, 'docs'), agent: true, dryRun: true, base: 'main', pages: { 'docs/a.md': '/guide/a.html' } })

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-review-changes-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  fs.mkdirSync(path.join(root, 'docs'))
  write('docs/a.md', '# A\n\nOriginal\n\n## Details\n\nKeep this\n')
  write('docs/deleted.md', '# Removed page\n')
  commit('Starting point')
  git('checkout', '-qb', 'feature')
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('changeRegions', () => {
  it('distinguishes edits from commentable context and finds the heading', () => {
    const source = '# Guide\n\n## Install\n\nNew\nContext\n'
    const [region] = changeRegions('@@ -3,4 +3,4 @@\n ## Install\n \n-Old\n+New\n Context', source)
    expect(region).toMatchObject({ line: 5, end: 5, kind: 'updated', label: 'Install', ranges: [{ start: 5, end: 5 }] })
  })

  it('anchors deletions at the next surviving line, including at EOF', () => {
    const [region] = changeRegions('@@ -1,4 +1,2 @@\n # A\n \n-old\n-old too', '# A\n\n')
    expect(region.ranges).toEqual([])
    expect(region.kind).toBe('removed')
    expect(region.line).toBe(3)
  })

  it('labels frontmatter changes as metadata', () => {
    const [region] = changeRegions('@@ -1,3 +1,3 @@\n ---\n-title: Old\n+title: New\n ---', '---\ntitle: New\n---\n# Heading\n')
    expect(region.label).toBe('Page metadata')
    expect(region.line).toBe(2)
  })

  it('keeps distant hunks separate and excludes context gaps from highlights', () => {
    const regions = changeRegions('@@ -1,4 +1,4 @@\n-a\n+b\n context\n-c\n+d\n context\n@@ -20 +20 @@\n-e\n+f', 'b\ncontext\nd\ncontext\n')
    expect(regions).toHaveLength(2)
    expect(regions[0].ranges).toEqual([{ start: 1, end: 1 }, { start: 3, end: 3 }])
  })
})

describe('loadChanges in a real repository', () => {
  it('lists branch commits oldest first and changes the comparison start', async () => {
    git('config', 'color.ui', 'always')
    write('docs/a.md', '# A\n\nFirst edit\n')
    const first = commit('First edit')
    write('docs/a.md', '# A\n\nSecond edit\n')
    const second = commit('Second edit')
    const all = await loadChanges(opts())
    expect(all.error).toBeNull()
    expect(all.commits).toEqual([{ sha: first, subject: 'First edit' }, { sha: second, subject: 'Second edit' }])
    expect(all.files[0].page).toBe('/guide/a.html')
    expect(all.files[0].regions[0].patch).toContain('-Original')
    const selected = await loadChanges(opts(), { from: first })
    expect(selected.files[0].regions[0].patch).toContain('-First edit')
    expect(selected.files[0].regions[0].patch).not.toContain('-Original')
    const head = await loadChanges(opts(), { from: second })
    expect(head.files).toEqual([])
  })

  it('includes staged, unstaged, untracked, deleted and renamed docs, excludes other files', async () => {
    write('docs/a.md', '# A\n\nStaged\n')
    git('add', 'docs/a.md')
    write('docs/a.md', '# A\n\nUnstaged\n')
    fs.renameSync(path.join(root, 'docs/deleted.md'), path.join(root, 'docs/renamed.md'))
    write('docs/new.md', '# New\n')
    write('outside.md', '# Outside docs\n')
    const result = await loadChanges(opts())
    expect(result.error).toBeNull()
    expect(result.files.map((f) => [f.path, f.kind])).toEqual([
      ['docs/a.md', 'modified'], ['docs/deleted.md', 'deleted'], ['docs/new.md', 'new'], ['docs/renamed.md', 'new']
    ])
    expect(result.files[0].regions[0].patch).toContain('+Unstaged')
    expect(result.files[1].page).toBeNull()
    expect(result.files[2].regions).toHaveLength(1)
    expect(result.files[2].regions[0].label).toBe('New page')
  })

  it('uses the merge base when the base branch advanced', async () => {
    const starting = git('rev-parse', 'HEAD')
    write('docs/a.md', '# Feature\n')
    commit('Feature edit')
    git('checkout', '-q', 'main')
    write('docs/base-only.md', '# Base only\n')
    commit('Base advanced')
    git('checkout', '-q', 'feature')
    const result = await loadChanges(opts())
    expect(result.base).toBe(starting)
    expect(result.commits.map((c) => c.subject)).toEqual(['Feature edit'])
    expect(result.files.map((f) => f.path)).toEqual(['docs/a.md'])
  })

  it('returns a useful error for an invalid base or stale commit', async () => {
    expect((await loadChanges(opts(), { base: '--output=bad' })).error).toContain('valid base')
    expect((await loadChanges(opts(), { from: 'a'.repeat(40) })).error).toContain('no longer in this branch')
    expect((await loadChanges({ ...opts(), gitRoot: null })).error).toContain('not in a Git repository')
  })

  it('detects main without using gh in agent mode and supports filenames with pathspec characters', async () => {
    write('docs/[a].md', '# Brackets\n')
    commit('Add brackets')
    const result = await loadChanges({ ...opts(), base: undefined })
    expect(result.baseRef).toBe('main')
    expect(result.error).toBeNull()
    expect(result.files[0].regions[0].patch).toContain('+# Brackets')
  })

  it('does not read an untracked symlink outside the docs directory', async () => {
    write('private.md', 'Do not expose this\n')
    fs.symlinkSync('../private.md', path.join(root, 'docs/link.md'))
    const result = await loadChanges(opts())
    expect(result.error).toBeNull()
    expect(result.files).toEqual([])
  })
})
