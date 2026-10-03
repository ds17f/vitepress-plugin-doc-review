import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { createMarkdownRenderer, disposeMdItInstance, type MarkdownRenderer } from 'vitepress'
import { docReviewMarkdown, lineOffset, mapLines } from '../src/node/markdown.js'

const repoRoot = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
const docs = path.join(repoRoot, 'docs')

let md: MarkdownRenderer
let gitRoot = repoRoot

beforeAll(async () => {
  md = await createMarkdownRenderer(docs, {
    config: (m) => docReviewMarkdown(m, { gitRoot: () => gitRoot, isEnabled: () => true })
  })
})

function render(file: string, src = fs.readFileSync(file, 'utf8')): string {
  return md.render(src, { path: file, realPath: file, relativePath: path.relative(docs, file), includes: [] })
}

interface Block {
  tag: string
  file: string
  line: number
  end: number
  kind?: string
}

function blocks(html: string): Block[] {
  const out: Block[] = []
  const re = /<([a-z0-9]+)\b[^>]*?data-source-file="([^"]+)"[^>]*>/g
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const tag = m[0]
    const num = (name: string) => Number(/data-source-line="(\d+)"/.exec(tag) && new RegExp(`${name}="(\\d+)"`).exec(tag)![1])
    out.push({
      tag: m[1],
      file: m[2],
      line: num('data-source-line'),
      end: num('data-source-end'),
      kind: /data-source-kind="(\w+)"/.exec(tag)?.[1]
    })
  }
  return out
}

/** What the source line of each block must look like. */
function checkBlock(b: Block, lines: string[]) {
  const first = lines[b.line - 1]
  const last = lines[b.end - 1]
  const ctx = `${b.tag} ${b.file}:${b.line}-${b.end} → ${JSON.stringify(first)}`
  expect(b.line, ctx).toBeGreaterThan(0)
  expect(b.end, ctx).toBeGreaterThanOrEqual(b.line)
  expect(last.trim(), `${ctx} (end line is blank)`).not.toBe('')
  if (/^h[1-6]$/.test(b.tag)) expect(first, ctx).toMatch(new RegExp(`^#{${b.tag[1]}} `))
  else if (b.tag === 'p') expect(first.replace(/^(\s*>)+\s?/, ''), ctx).toMatch(/^\s*(?!```)[^\s#|>-]/)
  else if (b.tag === 'tr') expect(first, ctx).toMatch(/^\s*\|/)
  else if (b.tag === 'li') expect(first, ctx).toMatch(/^\s*(-|\d+\.) /)
  else if (b.tag === 'ul' || b.tag === 'ol') expect(first, ctx).toMatch(/^\s*(-|\d+\.) /)
  else if (b.tag === 'blockquote') expect(first, ctx).toMatch(/^> /)
  else if (b.tag === 'hr') expect(first, ctx).toBe('---')
  else if (b.kind === 'fence') {
    expect(first, ctx).toMatch(/^```/)
    expect(last, ctx).toMatch(/^```$/)
  } else if (b.kind === 'code') expect(first, ctx).toMatch(/^ {4}/)
}

/** All pages of the docs site. Files that start with "_" are include parts, and the include page has no lines. */
function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name.startsWith('.') ? [] : pages(p)
    return e.name.endsWith('.md') && !e.name.startsWith('_') && !p.endsWith('fixtures/include.md') ? [p] : []
  })
}
const PL = path.join(docs, 'testing/playground.md')
const fileLines = (f: string) => fs.readFileSync(f, 'utf8').split('\n')

describe('source line attributes on docs pages', () => {
  const all = pages(docs)
  it('finds the pages', () => expect(all.length).toBeGreaterThanOrEqual(14))

  for (const file of all) {
    const page = path.relative(docs, file)
    it(`every block in ${page} points to its source line`, () => {
      const lines = fileLines(file)
      const found = blocks(render(file))
      expect(found.length).toBeGreaterThan(2)
      for (const b of found) {
        expect(b.file).toBe(`docs/${page}`)
        checkBlock(b, lines)
      }
    })
  }

  it('puts the first heading after the frontmatter on the correct line', () => {
    expect(render(PL)).toMatch(/<h1[^>]*data-source-line="13"/)
    expect(render(path.join(docs, 'testing/fixtures/deep/nested-page.md'))).toMatch(/<h1[^>]*data-source-line="5"/)
  })

  it('gives a page without frontmatter line 1 for the first heading', () => {
    expect(render(path.join(docs, 'testing/plain.md'))).toMatch(/<h1[^>]*data-source-line="1"/)
  })

  it('marks fences on the wrapper element with the full range', () => {
    const lines = fileLines(PL)
    const fence = blocks(render(PL)).find((b) => b.kind === 'fence' && lines[b.line - 1] === '```js')!
    expect(fence.tag).toBe('div')
    expect(lines[fence.line]).toBe("import { run } from 'example-tool'")
    expect(lines[fence.end - 1]).toBe('```')
  })

  it('uses the multi-line range of a paragraph and marks each line break', () => {
    const lines = fileLines(PL)
    const html = render(PL)
    const p = blocks(html).find((b) => b.tag === 'p' && lines[b.line - 1].startsWith('A paragraph with'))!
    expect(p.end - p.line).toBe(2)
    expect(lines[p.end - 1]).toBe('and on a third source line.')
    expect(p.kind).toBe('text')
    // Vue changes the newlines to spaces, so each source line break gets a marker.
    const para = html.slice(html.indexOf(`<p data-source-file="docs/testing/playground.md" data-source-line="${p.line}"`))
    expect(para.slice(0, para.indexOf('</p>')).match(/<wbr data-source-br>/g)).toHaveLength(2)
  })

  it('turns lines off on the page with an include', () => {
    const file = path.join(docs, 'testing/fixtures/include.md')
    const src = fs.readFileSync(file, 'utf8').replace('<!--@include: ./_part.md-->', fs.readFileSync(path.join(docs, 'testing/fixtures/_part.md'), 'utf8'))
    const html = md.render(src, { path: file, realPath: file, includes: [path.join(docs, 'testing/fixtures/_part.md')] })
    expect(html).toContain('data-source-unreliable="true"')
    expect(html).not.toContain('data-source-line=')
  })
})

describe('frontmatter offset', () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-review-'))
    fs.mkdirSync(path.join(dir, 'docs/deep'), { recursive: true })
  })

  function write(name: string, src: string) {
    const f = path.join(dir, name)
    fs.writeFileSync(f, src)
    return f
  }

  const cases: [string, string, number][] = [
    ['no frontmatter', '# Title\n\nText\n', 1],
    ['frontmatter', '---\ntitle: X\n---\n# Title\n\nText\n', 4],
    ['frontmatter and blank line', '---\ntitle: X\nlist:\n  - a\n  - b\n---\n\n# Title\n\nText\n', 8],
    ['CRLF line ends', '---\r\ntitle: X\r\n---\r\n\r\n# Title\r\n\r\nText\r\n', 5],
    ['empty frontmatter', '---\n---\n# Title\n', 3]
  ]
  for (const [name, src, expected] of cases) {
    it(`maps the heading to line ${expected} (${name})`, () => {
      gitRoot = fs.realpathSync(dir)
      const f = write('docs/deep/page.md', src)
      const html = md.render(src, { path: f, realPath: f, includes: [] })
      gitRoot = repoRoot
      expect(html).toContain('data-source-file="docs/deep/page.md"')
      expect(html).toMatch(new RegExp(`<h1[^>]*data-source-line="${expected}"`))
    })
  }

  it('turns lines off when the rendered text is not the file (includes, dynamic routes)', () => {
    const f = write('docs/inc.md', '# Title\n\n<!--@include: ./other.md-->\n')
    const html = md.render('# Title\n\nIncluded text\n', { path: f, realPath: f, includes: ['other.md'] })
    expect(html).toContain('data-source-unreliable="true"')
    expect(html).not.toContain('data-source-line=')
  })

  it('adds nothing when the plugin is off', async () => {
    // VitePress keeps one markdown-it instance. Make a new one.
    disposeMdItInstance()
    const off = await createMarkdownRenderer(docs, {
      config: (m) => docReviewMarkdown(m, { gitRoot: () => repoRoot, isEnabled: () => false })
    })
    const f = PL
    const html = off.render(fs.readFileSync(f, 'utf8'), { path: f, realPath: f, includes: [] })
    expect(html).not.toContain('data-source-')
  })
})

describe('lineOffset and mapLines', () => {
  it('counts the lines before the parsed text', () => {
    expect(lineOffset('---\na: 1\n---\nbody\n', 'body\n')).toBe(3)
    expect(lineOffset('body\n', 'body\n')).toBe(0)
    expect(lineOffset('abc', 'xyz')).toBeNull()
  })
  it('removes trailing blank lines from a block range', () => {
    expect(mapLines([2, 5], 3, ['a', 'b', 'c', 'd', '', ''])).toEqual([6, 7])
    expect(mapLines([0, 1], 0, ['a'])).toEqual([1, 1])
  })
})
