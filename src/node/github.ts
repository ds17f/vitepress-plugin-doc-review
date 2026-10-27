import path from 'node:path'
import { commentableFromFiles, type PullFile } from './diff.js'
import { run, type ExecResult } from './exec.js'
import type { GitHubIssuePayload, GitHubReviewPayload, PrStatus, Problem, Warning } from '../shared/types.js'

export interface ContextOptions {
  gitRoot: string | null
  /** Absolute path of the docs source directory. */
  srcDir: string
  /** `owner/name`. Detected with `gh` when not set. */
  repo?: string
  dryRun: boolean
  /** Base branch or commit used for change navigation. */
  base?: string
  /** Repository-relative source file to VitePress route. */
  pages?: Record<string, string>
  /** The `doc-review` command started the server: the submit goes to the agent, not to GitHub. */
  agent?: boolean
}

export interface ReviewContext extends PrStatus {
  /** Commit to attach the review to. */
  commitId: string | null
  /** In issue mode: the pushed commit that the issue links to. `null` when HEAD is not on a remote branch. */
  linkCommit: string | null
}

function ghProblem(r: ExecResult, what: string): Problem {
  if (r.missing) return { code: 'gh-missing', message: 'The GitHub CLI (gh) is not installed. Install it from https://cli.github.com.' }
  const err = r.stderr.trim()
  if (r.code === 4 || /gh auth login|not logged in|authentication/i.test(err))
    return { code: 'gh-auth', message: 'The GitHub CLI is not logged in. Run "gh auth login" in a terminal.' }
  if (/no (open )?pull requests? found/i.test(err))
    return { code: 'no-pr', message: `No open pull request for this branch. ${err}`.trim() }
  return { code: 'gh-error', message: `${what} failed: ${err || `exit code ${r.code}`}` }
}

async function git(gitRoot: string, args: string[]): Promise<string | null> {
  const r = await run('git', args, { cwd: gitRoot })
  return r.code === 0 ? r.stdout.trim() : null
}

/** True when a remote-tracking branch contains `commit`, so GitHub has it. */
async function isPushed(gitRoot: string, commit: string): Promise<boolean> {
  const out = await git(gitRoot, ['branch', '-r', '--contains', commit])
  return !!out
}

/** Uncommitted .md changes in the docs directory. */
async function dirtyDocs(gitRoot: string, srcDir: string): Promise<string[]> {
  const rel = path.relative(gitRoot, srcDir) || '.'
  const out = await run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', rel], { cwd: gitRoot })
  if (out.code !== 0) return []
  const files: string[] = []
  const parts = out.stdout.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (!entry) continue
    const status = entry.slice(0, 2)
    files.push(entry.slice(3))
    if (status[0] === 'R' || status[0] === 'C') i++ // the next part is the old name
  }
  return files.filter((f) => f.endsWith('.md'))
}

/**
 * Collect everything the review needs: the repo, the PR of the current branch,
 * the commentable lines, and the local state checks. Problems do not throw:
 * they are part of the result, so the UI can show them.
 */
export async function loadContext(opts: ContextOptions): Promise<ReviewContext> {
  const ctx: ReviewContext = {
    dryRun: opts.dryRun,
    mode: 'review',
    repo: opts.repo ?? null,
    branch: null,
    pr: null,
    commentable: {},
    warnings: [],
    problem: null,
    canSubmit: false,
    commitId: null,
    linkCommit: null
  }
  const finish = (): ReviewContext => {
    if (!ctx.pr) {
      // Without a PR the diff is unknown, so no line is "outside the diff".
      // In review mode a real submit stays blocked; a dry run allows all lines so the payload can still be checked.
      ctx.commentable = null
      if (ctx.dryRun) ctx.commitId ??= '0000000'
    }
    if (ctx.mode !== 'review') ctx.canSubmit = !ctx.problem
    else ctx.canSubmit = ctx.dryRun ? !!ctx.commitId : !!ctx.pr && !ctx.problem && ctx.warnings.length === 0
    return ctx
  }

  const root = opts.gitRoot
  if (!root) {
    ctx.problem = { code: 'not-git', message: 'The docs are not in a git repository.' }
    return finish()
  }
  ctx.branch = await git(root, ['branch', '--show-current'])
  const head = await git(root, ['rev-parse', 'HEAD'])
  if (head) ctx.commitId = head

  // The agent reads the local files, so it needs no PR, no push, and no `gh`.
  if (opts.agent) {
    ctx.mode = 'agent'
    return finish()
  }

  /** The repository is known, but the branch has no open PR: the submit opens an issue. */
  const issueMode = async (): Promise<ReviewContext> => {
    ctx.mode = 'issue'
    const warnings: Warning[] = []
    if (!head) {
      warnings.push({ code: 'no-head', message: 'The repository has no commits, so the issue has no links to the lines.' })
    } else if (await isPushed(root, head)) {
      ctx.linkCommit = head
    } else {
      warnings.push({ code: 'not-pushed', message: `Your local HEAD (${head.slice(0, 7)}) is not pushed, so the issue has no links to the lines. Push, then reload, to add links.` })
    }
    const dirty = await dirtyDocs(root, opts.srcDir)
    if (dirty.length) {
      warnings.push({ code: 'dirty-docs', message: `These docs files have changes that are not committed: ${dirty.join(', ')}. The line numbers in the issue can be different from the files on GitHub.` })
    }
    ctx.warnings = warnings
    return finish()
  }

  if (!ctx.repo) {
    const r = await run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd: root })
    if (r.code !== 0) {
      ctx.problem = r.missing || r.code === 4 ? ghProblem(r, 'gh repo view') : { code: 'no-repo', message: `Cannot find the GitHub repository: ${r.stderr.trim() || 'no GitHub remote'}. Set the "repo" option.` }
      return finish()
    }
    ctx.repo = r.stdout.trim()
  }

  const prArgs = ['pr', 'view', '--json', 'number,url,headRefOid,state']
  if (opts.repo) {
    // A detached HEAD has no branch, so it has no PR.
    if (!ctx.branch) return issueMode()
    prArgs.splice(2, 0, ctx.branch)
    prArgs.push('--repo', opts.repo)
  }
  const prRes = await run('gh', prArgs, { cwd: root })
  if (prRes.code !== 0) {
    const problem = ghProblem(prRes, 'gh pr view')
    if (problem.code === 'no-pr') return issueMode()
    ctx.problem = problem
    return finish()
  }
  const pr = JSON.parse(prRes.stdout) as { number: number; url: string; headRefOid: string; state: string }
  if (pr.state !== 'OPEN') return issueMode()
  ctx.pr = { number: pr.number, url: pr.url, headRefOid: pr.headRefOid }
  ctx.commitId = pr.headRefOid

  const filesRes = await run('gh', ['api', `repos/${ctx.repo}/pulls/${pr.number}/files`, '--paginate', '--slurp'], { cwd: root })
  if (filesRes.code !== 0) {
    ctx.problem = ghProblem(filesRes, 'Reading the pull request files')
    return finish()
  }
  const pages = JSON.parse(filesRes.stdout) as PullFile[][]
  ctx.commentable = commentableFromFiles(pages.flat())

  const warnings: Warning[] = []
  if (!head) {
    warnings.push({ code: 'no-head', message: 'The repository has no commits.' })
  } else if (head !== pr.headRefOid) {
    warnings.push({
      code: 'head-mismatch',
      message: `Your local HEAD (${head.slice(0, 7)}) is not the head of PR #${pr.number} (${pr.headRefOid.slice(0, 7)}). Pull or push, then reload. Line numbers can be wrong until then.`
    })
  }
  const dirty = await dirtyDocs(root, opts.srcDir)
  if (dirty.length) {
    warnings.push({
      code: 'dirty-docs',
      message: `These docs files have changes that are not committed and pushed: ${dirty.join(', ')}. Line numbers can be wrong until you push them.`
    })
  }
  ctx.warnings = warnings
  return finish()
}

/** Post the review with `gh api`. The JSON goes on stdin. */
export function postReview(gitRoot: string, repo: string, prNumber: number, payload: GitHubReviewPayload): Promise<{ url?: string }> {
  return ghPost(gitRoot, `repos/${repo}/pulls/${prNumber}/reviews`, payload, 'the review')
}

/** Open the issue with `gh api`. The JSON goes on stdin. */
export function postIssue(gitRoot: string, repo: string, payload: GitHubIssuePayload): Promise<{ url?: string }> {
  return ghPost(gitRoot, `repos/${repo}/issues`, payload, 'the issue')
}

async function ghPost(gitRoot: string, endpoint: string, payload: unknown, what: string): Promise<{ url?: string }> {
  const r = await run('gh', ['api', '--method', 'POST', endpoint, '--input', '-'], {
    cwd: gitRoot,
    input: JSON.stringify(payload)
  })
  if (r.code !== 0) {
    let msg = r.stderr.trim()
    try {
      const body = JSON.parse(r.stdout)
      msg = [body.message, ...(body.errors ?? []).map((e: unknown) => (typeof e === 'string' ? e : JSON.stringify(e)))].filter(Boolean).join(' — ') || msg
    } catch {}
    throw new Error(`GitHub refused ${what}: ${msg}`)
  }
  const res = JSON.parse(r.stdout) as { html_url?: string }
  return { url: res.html_url }
}
