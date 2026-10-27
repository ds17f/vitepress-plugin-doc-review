import fs from 'node:fs/promises'
import path from 'node:path'
import { run } from './exec.js'
import type { ContextOptions } from './github.js'
import type { ChangeRegion, ChangesStatus, ChangedFile, Hunk } from '../shared/types.js'

async function git(root: string, args: string[]): Promise<string> {
  const result = await run('git', ['--literal-pathspecs', ...args], { cwd: root })
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'Git comparison failed.')
  return result.stdout
}

/** Parse actual edits separately from the context lines on which GitHub permits comments. */
export function changeRegions(patch: string, source: string): ChangeRegion[] {
  const regions: ChangeRegion[] = []
  let current: ChangeRegion | undefined
  let line = 0
  for (const raw of patch.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (header) {
      line = Number(header[1])
      current = { line: Math.max(1, line), end: Math.max(1, line), label: '', kind: 'updated', ranges: [], patch: raw }
      regions.push(current)
      continue
    }
    if (!current) continue
    current.patch += `\n${raw}`
    if (raw.startsWith('+')) {
      const last = current.ranges.at(-1)
      if (last && last.end === line - 1) last.end = line
      else current.ranges.push({ start: line, end: line })
      line++
    } else if (raw.startsWith(' ')) line++
  }
  const lines = source.split('\n')
  const frontmatterEnd = lines[0]?.trim() === '---' ? lines.findIndex((s, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(s)) + 1 : 0
  for (const region of regions) {
    const body = region.patch.split('\n').slice(1)
    const added = body.some((s) => s.startsWith('+'))
    const removed = body.some((s) => s.startsWith('-'))
    region.kind = added ? removed ? 'updated' : 'added' : 'removed'
    // A deletion-only hunk must anchor at the deletion, rather than its first context line.
    let position = region.line
    let firstEdit: number | undefined
    for (const s of body) {
      if ((s.startsWith('+') || s.startsWith('-')) && firstEdit === undefined) firstEdit = position
      if (s.startsWith('+') || s.startsWith(' ')) position++
    }
    region.line = Math.max(1, Math.min(firstEdit ?? region.line, lines.length))
    region.end = region.ranges.at(-1)?.end ?? region.line
    if (frontmatterEnd && region.line <= frontmatterEnd) region.label = 'Page metadata'
    else {
      let fenced = false
      for (let i = frontmatterEnd; i < Math.min(region.line, lines.length); i++) {
        if (/^\s*(`{3,}|~{3,})/.test(lines[i])) fenced = !fenced
        const heading = !fenced && /^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(lines[i])
        if (heading) region.label = heading[1]
      }
    }
    region.label ||= body.find((s) => /^[+-]\S/.test(s))?.slice(1, 100) || `Line ${region.line}`
  }
  return regions
}

async function resolveCommit(root: string, ref: string): Promise<string> {
  if (!ref || ref.length > 256 || ref.startsWith('-') || /[\x00-\x20]/.test(ref)) throw new Error('Enter a valid base branch or commit.')
  return (await git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim()
}

async function defaultBase(opts: ContextOptions): Promise<string> {
  const root = opts.gitRoot!
  if (opts.base) return opts.base
  if (!opts.agent) {
    const args = ['pr', 'view', '--json', 'baseRefName,state']
    if (opts.repo) args.push('--repo', opts.repo)
    const pr = await run('gh', args, { cwd: root })
    if (pr.code === 0) {
      const info = JSON.parse(pr.stdout)
      if (info.state === 'OPEN' && typeof info.baseRefName === 'string') {
        for (const ref of [`origin/${info.baseRefName}`, info.baseRefName]) {
          try { await resolveCommit(root, ref); return ref } catch {}
        }
        throw new Error(`The PR base (${info.baseRefName}) is unavailable locally. Fetch it, or enter a base below.`)
      }
    }
  }
  const remote = await run('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: root })
  if (remote.code === 0) return remote.stdout.trim()
  for (const ref of ['main', 'master']) {
    try { await resolveCommit(root, ref); return ref } catch {}
  }
  throw new Error('No base branch detected. Enter a branch or commit to compare against.')
}

/** Compare a chosen branch commit with the current files, without changing the checkout. */
export async function loadChanges(opts: ContextOptions, query: { base?: string; from?: string } = {}): Promise<ChangesStatus> {
  const empty: ChangesStatus = { baseRef: query.base ?? opts.base ?? '', base: '', head: '', from: '', commits: [], files: [], error: null }
  try {
    if (!opts.gitRoot) throw new Error('The docs are not in a Git repository.')
    const root = opts.gitRoot
    const baseRef = query.base || await defaultBase(opts)
    empty.baseRef = baseRef
    const baseCommit = await resolveCommit(root, baseRef)
    const head = await resolveCommit(root, 'HEAD')
    const base = (await git(root, ['merge-base', baseCommit, head])).trim()
    // Include commits from every ancestry path; display them oldest first.
    const log = await git(root, ['log', '--no-show-signature', '--reverse', '--topo-order', '--format=%H%x00%s', `${base}..${head}`, '--'])
    const commits = log.trimEnd().split('\n').filter(Boolean).map((s) => {
      const [sha, subject] = s.split('\0')
      return { sha, subject }
    })
    const from = query.from || base
    if (from !== base && !commits.some((c) => c.sha === from)) throw new Error('The selected commit is no longer in this branch. Reload the comparison.')
    Object.assign(empty, { base, head, from, commits })
    const docs = path.relative(root, opts.srcDir).split(path.sep).join('/') || '.'
    if (docs === '..' || docs.startsWith('../') || path.isAbsolute(docs)) throw new Error('The docs directory must be inside the repository.')
    const names = (await git(root, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', from, '--', docs])).split('\0')
    const entries: { status: string; file: string }[] = []
    for (let i = 0; i + 1 < names.length; i += 2) if (names[i + 1].endsWith('.md')) entries.push({ status: names[i], file: names[i + 1] })
    const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', docs])).split('\0').filter((s) => s.endsWith('.md'))
    for (const file of untracked) entries.push({ status: 'A', file })
    for (const { status, file } of entries.sort((a, b) => a.file.localeCompare(b.file))) {
      const deleted = status === 'D'
      let source = ''
      if (!deleted) {
        const real = await fs.realpath(path.join(root, file))
        const relative = path.relative(await fs.realpath(opts.srcDir), real)
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue
        source = await fs.readFile(real, 'utf8')
      }
      const addedLines = source ? source.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : []
      const patch = untracked.includes(file)
        ? `@@ -0,0 +1,${addedLines.length} @@\n${addedLines.map((s) => `+${s}`).join('\n')}${source && !source.endsWith('\n') ? '\n\\ No newline at end of file' : ''}`
        : await git(root, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=3', from, '--', file])
      const kind: ChangedFile['kind'] = deleted ? 'deleted' : status === 'A' ? 'new' : 'modified'
      let regions = changeRegions(patch, source)
      if (kind !== 'modified') {
        const ranges: Hunk[] = kind === 'new' && addedLines.length ? [{ start: 1, end: addedLines.length }] : []
        regions = [{ line: 1, end: ranges[0]?.end ?? 1, label: kind === 'new' ? 'New page' : 'Deleted page', kind: kind === 'new' ? 'added' : 'removed', ranges, patch }]
      }
      if (!regions.length) regions = [{ line: 1, end: 1, label: 'Source-only change', kind: 'updated', ranges: [], patch }]
      const page = deleted ? null : opts.pages?.[file] ?? null
      empty.files.push({ path: file, page, kind, regions })
    }
    return empty
  } catch (e) {
    return { ...empty, files: [], error: (e as Error).message }
  }
}
