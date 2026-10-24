#!/usr/bin/env node
/**
 * `doc-review [docs-dir]`: start the VitePress dev server in agent mode and
 * open the browser. When the reviewer submits, print the review on stdout and
 * stop. A coding agent runs this command and reads the review from stdout.
 *
 * `doc-review install-skill`: copy the Claude Code skill into `.claude/skills/`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { setAgentSink } from './agent.js'
import type { AgentFeedback } from '../shared/types.js'

const USAGE = `Usage: doc-review [docs-dir] [options]
       doc-review install-skill [--global] [--force]

Start the VitePress dev server with the review UI and open the browser.
When you submit the review, the comments go to stdout and the server stops.

  docs-dir         The VitePress source directory. Default: "docs" if it has
                   a .vitepress directory, else the current directory.

Options:
  --port <n>       The port of the dev server. Default: the VitePress default.
  --host <host>    Listen on this address, for example 0.0.0.0. Other computers
                   can then see the docs and send a review.
  --no-open        Do not open the browser.
  --json           Print the review as JSON, not as markdown.
  -h, --help       Show this help.

install-skill copies the Claude Code skill to .claude/skills/doc-review in the
current directory. Then type /doc-review in Claude Code.

  --global         Copy it to ~/.claude/skills/doc-review, for all projects.
  --force          Replace a skill that is different from this version.`

// dist/node/cli.js -> skills/doc-review in the package root.
const SKILL_DIR = fileURLToPath(new URL('../../skills/doc-review/', import.meta.url))

function installSkill(global: boolean, force: boolean): void {
  const src = path.join(SKILL_DIR, 'SKILL.md')
  const destDir = path.join(global ? os.homedir() : process.cwd(), '.claude', 'skills', 'doc-review')
  const dest = path.join(destDir, 'SKILL.md')
  const text = fs.readFileSync(src, 'utf8')
  if (fs.existsSync(dest)) {
    if (fs.readFileSync(dest, 'utf8') === text) {
      console.error(`doc-review: the skill in ${destDir} is up to date.`)
      return
    }
    if (!force) {
      console.error(`doc-review: ${dest} exists and is different. Run again with --force to replace it.`)
      process.exit(1)
    }
  }
  fs.mkdirSync(destDir, { recursive: true })
  fs.writeFileSync(dest, text)
  console.error(`doc-review: installed the skill in ${destDir}. Type /doc-review in Claude Code.`)
}

function findRoot(arg: string | undefined): string {
  if (arg) return path.resolve(arg)
  const docs = path.resolve('docs')
  return fs.existsSync(path.join(docs, '.vitepress')) ? docs : process.cwd()
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      global: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  })
  if (values.help) {
    console.log(USAGE)
    return
  }
  if (positionals[0] === 'install-skill') return installSkill(values.global, values.force)
  const root = findRoot(positionals[0])
  if (!fs.existsSync(path.join(root, '.vitepress'))) {
    console.error(`doc-review: ${root} has no .vitepress directory. Give the docs directory as the first argument.`)
    process.exit(2)
  }
  const port = values.port === undefined ? undefined : Number(values.port)
  if (port !== undefined && !Number.isInteger(port)) {
    console.error(`doc-review: --port must be a number.`)
    process.exit(2)
  }

  // Stdout is for the review only. Send the VitePress and Vite logs to stderr.
  console.log = console.error
  console.info = console.error

  let deliver!: (f: AgentFeedback) => void
  const feedback = new Promise<AgentFeedback>((resolve) => (deliver = resolve))
  setAgentSink((f) => deliver(f))

  const { createServer } = await import('vitepress')
  const server = await createServer(root, { port, host: values.host, open: !values['no-open'] })
  await server.listen()
  server.printUrls()
  console.error('\n[doc-review] Waiting for the review. Select text in the page, add comments, then click "Send to agent".')

  const result = await feedback
  process.stdout.write(`${values.json ? JSON.stringify(result, null, 2) : result.markdown}\n`)
  // Let the browser get the response to the submit before the server stops.
  await new Promise((r) => setTimeout(r, 250))
  await Promise.race([server.close(), new Promise((r) => setTimeout(r, 2000))])
  process.exit(0)
}

main().catch((e) => {
  console.error(`doc-review: ${(e as Error).stack ?? e}`)
  process.exit(1)
})
