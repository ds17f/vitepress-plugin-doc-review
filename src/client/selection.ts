/** A place in a .md file that a selection points to. */
export interface SelectionTarget {
  path: string
  startLine: number
  line: number
  quote: string
  /** Element of the first selected block, used to place the UI. */
  anchor: HTMLElement
}

export const BLOCK_SELECTOR = '[data-source-line]'

function blockOf(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement
  return (el?.closest(BLOCK_SELECTOR) as HTMLElement | null) ?? null
}

function attrNum(el: HTMLElement, name: string): number {
  return Number(el.getAttribute(name))
}

/** Text nodes that the range really covers (not only touches at an edge). */
function coveredTextNodes(range: Range): Text[] {
  const root = range.commonAncestorContainer
  if (root.nodeType === Node.TEXT_NODE) return [root as Text]
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    if (!range.intersectsNode(t) || !t.data.trim()) continue
    if (t === range.endContainer && range.endOffset === 0) continue
    if (t === range.startContainer && range.startOffset >= t.length) continue
    out.push(t)
  }
  return out
}

/**
 * The exact source line of a point inside a block. Only blocks where one source
 * line is one HTML text line (paragraphs, headings, code) have `data-source-kind`.
 * For other blocks, return null: the caller uses the block's line range.
 */
function preciseLine(block: HTMLElement, node: Node, offset: number): number | null {
  const kind = block.getAttribute('data-source-kind')
  if (!kind) return null
  const start = attrNum(block, 'data-source-line')
  const end = attrNum(block, 'data-source-end')
  const r = document.createRange()
  r.setStart(block, 0)
  try {
    r.setEnd(node, offset)
  } catch {
    return null
  }
  // Text blocks have a marker at each source line break. Code keeps its newlines.
  const newlines = kind === 'text' ? r.cloneContents().querySelectorAll('[data-source-br]').length : (r.toString().match(/\n/g) ?? []).length
  // A fence has the opening ``` line first. An indented code block has not.
  const line = start + newlines + (kind === 'fence' ? 1 : 0)
  return Math.min(Math.max(line, start), end)
}

/** Map a DOM selection to a file and line range. Returns null when the selection is not on source blocks. */
export function targetFromSelection(sel: Selection | null): SelectionTarget | null {
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const nodes = coveredTextNodes(range)
  if (!nodes.length) return null
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const startBlock = blockOf(first)
  const endBlock = blockOf(last)
  if (!startBlock || !endBlock) return null
  const path = startBlock.getAttribute('data-source-file')
  if (!path || endBlock.getAttribute('data-source-file') !== path) return null

  const startOffset = first === range.startContainer ? range.startOffset : 0
  const endOffset = last === range.endContainer ? range.endOffset : last.length

  let startLine = preciseLine(startBlock, first, startOffset) ?? attrNum(startBlock, 'data-source-line')
  // The end point is just after the last selected character. Count the lines
  // up to that character, so a selection that ends at a line end stays on that line.
  let line = preciseLine(endBlock, last, Math.max(endOffset - 1, 0)) ?? attrNum(endBlock, 'data-source-end')
  if (!startLine || !line) return null
  if (line < startLine) [startLine, line] = [line, startLine]

  const quote = sel.toString().replace(/\n\s*\n+/g, '\n').trim()
  return { path, startLine, line, quote, anchor: startBlock }
}

/** All source blocks in the page that overlap a line range of a file. */
export function blocksForRange(path: string, start: number, end: number): HTMLElement[] {
  const out: HTMLElement[] = []
  document.querySelectorAll<HTMLElement>(BLOCK_SELECTOR).forEach((el) => {
    if (el.getAttribute('data-source-file') !== path) return
    const s = attrNum(el, 'data-source-line')
    const e = attrNum(el, 'data-source-end')
    if (s <= end && e >= start) out.push(el)
  })
  return out
}
