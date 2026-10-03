// End-to-end check in dry-run mode. It starts the docs dev server with
// DOC_REVIEW_DRY_RUN=1, opens pages in headless Chromium, selects text, adds
// comments, and submits. Then it reads the payload that the server logs and
// checks that each `path` and `line` points to the selected text in the .md file.
//
// Usage: node scripts/e2e-dry-run.mjs
// Set CHROME_PATH to a Chromium or Chrome binary. Without it, the script looks
// in the Playwright browser cache (~/.cache/ms-playwright).
// Nothing goes to GitHub.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5199
const BASE = `http://localhost:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const cache = path.join(os.homedir(), '.cache/ms-playwright')
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).sort().reverse() : []
  for (const d of dirs) {
    for (const rel of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const p = path.join(cache, d, rel)
      if (fs.existsSync(p)) return p
    }
  }
  throw new Error('No Chromium found. Set CHROME_PATH.')
}

// Start the dev server in dry-run mode and collect its output.
let serverLog = ''
const server = spawn(process.execPath, [path.join(REPO, 'node_modules/vitepress/bin/vitepress.js'), 'dev', 'docs', '--port', String(PORT), '--strictPort'], {
  cwd: REPO,
  env: { ...process.env, DOC_REVIEW_DRY_RUN: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))
for (let i = 0; ; i++) {
  try {
    await fetch(BASE)
    break
  } catch {
    if (i > 60) throw new Error(`The dev server did not start:\n${serverLog}`)
    await sleep(250)
  }
}

const chrome = spawn(findChrome(), ['--headless', '--remote-debugging-port=9333', '--no-sandbox', '--window-size=1280,900', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => {
  chrome.kill()
  server.kill()
})

let targets
for (let i = 0; i < 50; i++) {
  try {
    targets = await (await fetch('http://127.0.0.1:9333/json/list')).json()
    if (targets.find((t) => t.type === 'page')) break
  } catch {}
  await sleep(200)
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
  if (m.method === 'Runtime.exceptionThrown') console.log('[page exception]', m.params.exceptionDetails.exception?.description)
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails))
  return r.result.result.value
}
const waitFor = async (expr, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await evaluate(expr)) return
    await sleep(100)
  }
  throw new Error(`timeout: ${expr}`)
}

await send('Runtime.enable')
await send('Page.enable')

async function open(route) {
  await send('Page.navigate', { url: BASE + route })
  await waitFor(`!!document.querySelector('.vp-doc [data-source-line]') && !!document.querySelector('.dr-toggle')`, 15000)
  await sleep(300)
}

// Range helper in the page: find `text` inside the element that matches `sel` (or any source block).
const rangeJs = (text, endText) => `(() => {
  function find(t) {
    const w = document.createTreeWalker(document.querySelector('.vp-doc'), NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) { const i = n.data.indexOf(t); if (i >= 0) return [n, i] }
    throw new Error('text not found: ' + t)
  }
  const [a, ai] = find(${JSON.stringify(text)})
  const [b, bi] = ${endText ? `find(${JSON.stringify(endText)})` : '[a, ai]'}
  const r = document.createRange()
  r.setStart(a, ai)
  r.setEnd(b, bi + ${JSON.stringify(endText ?? text)}.length)
  return r
})()`

/** Select with real mouse events: press at the start of `text`, drag, release at its end. */
async function mouseSelect(text) {
  await evaluate(`${rangeJs(text)}.startContainer.parentElement.scrollIntoView({block:'center'})`)
  await sleep(200)
  const pts = await evaluate(`(() => { const r = ${rangeJs(text)}; const rs = r.getClientRects(); const f = rs[0], l = rs[rs.length-1]; return { x1: f.left + 1, y1: f.top + f.height/2, x2: l.right - 1, y2: l.top + l.height/2 } })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts.x1, y: pts.y1, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (pts.x1 + pts.x2) / 2, y: pts.y2, button: 'left', buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x2, y: pts.y2, button: 'left', buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.x2, y: pts.y2, button: 'left', clickCount: 1 })
  return evaluate('window.getSelection().toString()')
}

/** Select with the Range API, then fire mouseup like a real drag would. */
async function rangeSelect(text, endText) {
  await evaluate(`(() => { const r = ${rangeJs(text, endText)}; const s = getSelection(); s.removeAllRanges(); s.addRange(r); r.startContainer.parentElement.scrollIntoView({block:'center'}); document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true})); })()`)
  return evaluate('window.getSelection().toString()')
}

async function comment(body) {
  await waitFor(`!!document.querySelector('.dr-comment-btn')`)
  const title = await evaluate(`document.querySelector('.dr-comment-btn').title`)
  await evaluate(`document.querySelector('.dr-comment-btn').click()`)
  await waitFor(`!!document.querySelector('.dr-composer textarea')`)
  await evaluate(`(() => { const t = document.querySelector('.dr-composer textarea'); t.value = ${JSON.stringify(body)}; t.dispatchEvent(new Event('input')) })()`)
  await sleep(50)
  await evaluate(`[...document.querySelectorAll('.dr-composer button')].find(b => b.textContent === 'Add to review').click()`)
  await sleep(100)
  return title
}

function expectedLine(file, text) {
  const lines = fs.readFileSync(path.join(REPO, file), 'utf8').split('\n')
  const i = lines.findIndex((l) => l.includes(text))
  if (i < 0) throw new Error(`not in file: ${text}`)
  return i + 1
}

const cases = []
const add = (name, sel, title, file, text, startText) =>
  cases.push({ name, sel, title, file, line: expectedLine(file, text), startLine: startText ? expectedLine(file, startText) : undefined })
const PL = 'docs/testing/playground.md'

await open('/testing/playground')
await evaluate('localStorage.clear()')
await open('/testing/playground')

// The playground has 11 lines of frontmatter.
add('mouse drag, 2nd source line of a paragraph', await mouseSelect('source file'), await comment('c0'), PL, 'heading is on line 13 of the source file')
add('line in a js fence', await rangeSelect("'dist'"), await comment('c1'), PL, "output: 'dist'")
add('paragraph to fence (multi-line)', await rangeSelect('Install the package', 'example-tool'), await comment('c2'), PL, 'npm install --save-dev', 'Install the package')
add('paragraph in a tip container', await rangeSelect('when it exists'), await comment('c3'), PL, 'when it exists')
add('heading', await rangeSelect('First run'), await comment('c4'), PL, '## First run')
add('3rd source line of a paragraph', await rangeSelect('third source line'), await comment('c5'), PL, 'and on a third source line.')
add('list item', await rangeSelect('See the'), await comment('c6'), PL, 'See the')

// Three directories deep, client-side navigation.
await evaluate(`document.querySelector('.vp-doc a[href*="nested-page"]').click()`)
await waitFor(`!!document.querySelector('[data-source-file="docs/testing/fixtures/deep/nested-page.md"]')`)
await sleep(300)
const NP = 'docs/testing/fixtures/deep/nested-page.md'
add('nested page, 2nd source line of a paragraph', await rangeSelect('makes the directory'), await comment('c7'), NP, 'makes the directory')

// No frontmatter.
await open('/testing/plain')
const TL = 'docs/testing/plain.md'
add('table row', await rangeSelect('The directory to write.'), await comment('c8'), TL, 'The directory to write.')
add('nested list item', await rangeSelect('Carrot'), await comment('c9'), TL, '  - Carrot')
add('block quote, 2nd line', await rangeSelect('two source lines'), await comment('c10'), TL, '> two source lines.')
add('indented code, 2nd line', await rangeSelect('It has two lines.'), await comment('c11'), TL, '    It has two lines.')

// Comments must be off on a page with an include.
await send('Page.navigate', { url: BASE + '/testing/fixtures/include' })
await waitFor(`!!document.querySelector('.vp-doc [data-source-unreliable]') && !!document.querySelector('.dr-toggle')`, 15000)
await sleep(300)
await rangeSelect('turns')
await waitFor(`!!document.querySelector('.dr-comment-btn')`)
const offText = await evaluate(`document.querySelector('.dr-comment-btn').textContent + '|' + document.querySelector('.dr-comment-btn').disabled`)
const includeOk = offText === 'Comments are off on this page|true'

// The draft must stay after a reload.
await open('/testing/plain')
const count = Number(await evaluate(`document.querySelector('.dr-count').textContent`))

await evaluate(`document.querySelector('.dr-toggle').click()`)
await waitFor(`!!document.querySelector('.dr-panel')`)
await evaluate(`(() => { const t = document.querySelector('.dr-panel > textarea'); t.value = 'Dry-run summary'; t.dispatchEvent(new Event('input')) })()`)
await sleep(100)
const logStart = serverLog.length
await evaluate(`[...document.querySelectorAll('.dr-panel .dr-btn.primary')].pop().click()`)
await waitFor(`!!document.querySelector('.dr-panel .dr-pre') || !!document.querySelector('.dr-panel .dr-note.danger')`)
await sleep(300)

// Read the payload from the dev server terminal output.
const out = serverLog.slice(logStart)
const json = out.slice(out.indexOf('\n{') + 1, out.lastIndexOf('}') + 1)
const payload = JSON.parse(json)

let failed = (count === cases.length ? 0 : 1) + (includeOk ? 0 : 1)
console.log(`${count === cases.length ? 'PASS' : 'FAIL'} draft kept after reload: ${count} comments`)
console.log(`${includeOk ? 'PASS' : 'FAIL'} comments are off on the include page: ${offText}`)
for (const [i, c] of cases.entries()) {
  const got = payload.comments.find((x) => x.body.endsWith(`c${i}`))
  const ok = got && got.path === c.file && got.line === c.line && got.start_line === c.startLine
  if (!ok) failed++
  const fmt = (p, s, l) => `${p}:${s ? s + '-' : ''}${l}`
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: selected ${JSON.stringify(c.sel)}; logged ${got ? fmt(got.path, got.start_line, got.line) : 'nothing'}; expected ${fmt(c.file, c.startLine, c.line)}`)
}
ws.close()
process.exit(failed ? 1 : 0)
