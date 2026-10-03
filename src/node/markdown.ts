import fs from 'node:fs'
import path from 'node:path'
import type { MarkdownRenderer } from 'vitepress'

/** Minimal structural types, so the package needs no markdown-it type dependency. */
interface Token {
  type: string
  tag: string
  map: [number, number] | null
  nesting: number
  block: boolean
  hidden: boolean
  meta: any
  attrSet(name: string, value: string): void
}
interface CoreState {
  src: string
  env: Record<string, any>
  tokens: Token[]
}

const SRC_KEY = '__docReviewSrc'
const LINES_KEY = '__docReviewLines'

export interface MarkdownLineOptions {
  /** Absolute path of the git repository root. */
  gitRoot: () => string | null
  /** Return false to render without source attributes. */
  isEnabled: () => boolean
}

/** markdown-it normalizes line ends and NUL characters before it parses. Do the same. */
function normalize(src: string): string {
  return src.replace(/\r\n?/g, '\n').replace(/\0/g, '�')
}

function countLines(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

/**
 * Number of lines that come before `parsed` in `full`. VitePress removes the
 * frontmatter before markdown-it parses the page, so token line numbers start
 * after the frontmatter. Returns null when `parsed` is not the tail of `full`
 * (for example, the excerpt render).
 */
export function lineOffset(full: string, parsed: string): number | null {
  const f = normalize(full)
  if (!f.endsWith(parsed)) return null
  return countLines(f.slice(0, f.length - parsed.length))
}

/** Map a markdown-it token map to 1-based inclusive lines in the original file. */
export function mapLines(map: [number, number], offset: number, srcLines: string[]): [number, number] {
  const start = map[0]
  let end = map[1]
  // A block map can include trailing blank lines (for example, in a loose list).
  while (end > start + 1 && (srcLines[end - 1] ?? '').trim() === '') end--
  return [start + 1 + offset, end + offset]
}

function relPath(gitRoot: string, file: string): string {
  let real = file
  try {
    real = fs.realpathSync(file)
  } catch {}
  return path.relative(gitRoot, real).split(path.sep).join('/')
}

/** Tokens that get source attributes. `html_block` is raw HTML, so it is left alone. */
function wantsAttrs(t: Token): boolean {
  if (!t.block || !t.map || t.nesting === -1) return false
  if (t.type === 'html_block' || t.type === 'inline' || t.hidden) return false
  return true
}

/**
 * Check that the source that VitePress renders is the file on disk. `@include`
 * directives and dynamic routes change the text, so the line numbers would not
 * match the file.
 */
function sameAsDisk(file: string, src: string): boolean {
  try {
    return normalize(fs.readFileSync(file, 'utf8')) === normalize(src)
  } catch {
    return false
  }
}

/**
 * markdown-it plugin: put `data-source-file`, `data-source-line`, and
 * `data-source-end` on each block element. The file is relative to the git
 * root. The lines are 1-based and are lines of the .md file on disk (the
 * frontmatter is included in the count).
 */
export function docReviewMarkdown(md: MarkdownRenderer, opts: MarkdownLineOptions): void {
  // VitePress's frontmatter plugin wraps md.render and removes the frontmatter.
  // This wrapper goes on top of it (VitePress calls `markdown.config` last), so
  // it sees the full source.
  const render = md.render.bind(md)
  md.render = (src: string, env: any = {}) => {
    if (opts.isEnabled()) env[SRC_KEY] = src
    return render(src, env)
  }

  md.core.ruler.push('doc_review_lines', (state: CoreState) => {
    const env = state.env
    const full: string | undefined = env?.[SRC_KEY]
    const gitRoot = opts.gitRoot()
    const file: string | undefined = env?.realPath ?? env?.path
    if (!full || !gitRoot || !file || !opts.isEnabled()) return
    const offset = lineOffset(full, state.src)
    if (offset === null) return

    const rel = relPath(gitRoot, file)
    if (env.includes?.length || !sameAsDisk(file, full)) {
      const first = state.tokens.find(wantsAttrs)
      first?.attrSet('data-source-file', rel)
      first?.attrSet('data-source-unreliable', 'true')
      return
    }

    env[LINES_KEY] = true
    const srcLines = state.src.split('\n')
    for (const t of state.tokens) {
      if (!wantsAttrs(t)) continue
      const [start, end] = mapLines(t.map!, offset, srcLines)
      const attrs: [string, string][] = [
        ['data-source-file', rel],
        ['data-source-line', String(start)],
        ['data-source-end', String(end)]
      ]
      // In these blocks each source line is one text line in the HTML, so the
      // client can find the exact line of a selection.
      if (t.type === 'paragraph_open' || t.type === 'heading_open') attrs.push(['data-source-kind', 'text'])
      if (t.type === 'fence' || t.type === 'code_block') attrs.push(['data-source-kind', t.type === 'fence' ? 'fence' : 'code'])
      if (t.type === 'fence') {
        // VitePress's fence renderer drops token attrs. Keep them in meta and
        // add them to the wrapper element below.
        t.meta = { ...(t.meta ?? {}), docReviewAttrs: attrs }
      } else {
        for (const [k, v] of attrs) t.attrSet(k, v)
      }
    }
  })

  // Vue compiles the page HTML as a template and changes the newline of a soft
  // break to a space. Put an empty marker at each line break, so the client
  // can find the source line of a selection in a paragraph.
  for (const rule of ['softbreak', 'hardbreak'] as const) {
    const orig = md.renderer.rules[rule]
    md.renderer.rules[rule] = (tokens: any[], idx: number, options: any, env: any, self: any) => {
      const html: string = orig ? (orig as any)(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
      return env?.[LINES_KEY] ? `<wbr data-source-br>${html}` : html
    }
  }

  const fence = md.renderer.rules.fence
  if (fence) {
    md.renderer.rules.fence = (tokens: any[], idx: number, ...rest: any[]) => {
      const html: string = (fence as any)(tokens, idx, ...rest)
      const attrs: [string, string][] | undefined = tokens[idx].meta?.docReviewAttrs
      if (!attrs) return html
      const str = attrs.map(([k, v]) => ` ${k}="${md.utils.escapeHtml(v)}"`).join('')
      return html.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1${str}`)
    }
  }
}
