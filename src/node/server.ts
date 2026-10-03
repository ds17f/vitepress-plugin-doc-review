import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ViteDevServer } from 'vite'
import { buildReviewPayload, ReviewInputError } from './payload.js'
import { loadContext, postReview, type ContextOptions } from './github.js'
import type { SubmitRequest, SubmitResponse } from '../shared/types.js'

const MAX_BODY = 1024 * 1024
export const REVIEW_HEADER = 'x-doc-review'

/** Host names that always mean "this machine". */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * Decide if a request comes from a page of this dev server.
 *
 * - The `Host` header must be a known name of the dev server. This stops DNS
 *   rebinding, where another site makes its own name point to 127.0.0.1.
 * - When the browser sends `Origin`, it must be the dev server. A POST must send it.
 * - The custom header makes a cross-origin fetch need a CORS preflight, which
 *   this server never allows.
 */
export function isAllowedRequest(
  req: Pick<IncomingMessage, 'headers' | 'method'>,
  allowedHosts: Set<string>,
  port: number | null
): { ok: true } | { ok: false; reason: string } {
  const h = req.headers
  if (h[REVIEW_HEADER] !== '1') return { ok: false, reason: 'missing review header' }

  const hostOk = (hostname: string, p: string) =>
    allowedHosts.has(hostname.toLowerCase()) && (port === null || p === String(port))

  const host = h.host
  if (!host) return { ok: false, reason: 'missing Host header' }
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return { ok: false, reason: 'bad Host header' }
  }
  if (!hostOk(hostUrl.hostname, hostUrl.port || '80')) return { ok: false, reason: `Host ${host} is not the dev server` }

  const origin = h.origin
  if (origin) {
    let o: URL
    try {
      o = new URL(origin)
    } catch {
      return { ok: false, reason: 'bad Origin header' }
    }
    const p = o.port || (o.protocol === 'https:' ? '443' : '80')
    if (!/^https?:$/.test(o.protocol) || !hostOk(o.hostname, p)) return { ok: false, reason: `Origin ${origin} is not the dev server` }
  } else if (req.method !== 'GET') {
    return { ok: false, reason: 'missing Origin header' }
  }

  const site = h['sec-fetch-site']
  if (site && site !== 'same-origin') return { ok: false, reason: `Sec-Fetch-Site is ${site}` }
  return { ok: true }
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new ReviewInputError('The request is too large.'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new ReviewInputError('The request is not valid JSON.'))
      }
    })
    req.on('error', reject)
  })
}

export interface MiddlewareOptions {
  context: () => ContextOptions
  log: (msg: string) => void
}

export function installReviewMiddleware(server: ViteDevServer, opts: MiddlewareOptions): void {
  const allowedHosts = new Set(LOCAL_HOSTS)
  const cfgHost = server.config.server.host
  if (typeof cfgHost === 'string') allowedHosts.add(cfgHost.toLowerCase())
  let port: number | null = null

  server.httpServer?.once('listening', () => {
    const addr = server.httpServer?.address() as AddressInfo | null
    if (addr && typeof addr === 'object') port = addr.port
    // Network URLs (with --host) are names of this server too.
    for (const u of [...(server.resolvedUrls?.local ?? []), ...(server.resolvedUrls?.network ?? [])]) {
      try {
        allowedHosts.add(new URL(u).hostname.toLowerCase())
      } catch {}
    }
  })

  server.middlewares.use('/__review', async (req, res) => {
    const check = isAllowedRequest(req, allowedHosts, port)
    if (!check.ok) {
      opts.log(`refused ${req.method} /__review${req.url}: ${check.reason}`)
      return send(res, 403, { ok: false, error: { code: 'forbidden', message: 'Request refused.' } })
    }
    const url = (req.url ?? '/').split('?')[0]
    try {
      if (req.method === 'GET' && url === '/pr') {
        const { commitId: _commitId, ...status } = await loadContext(opts.context())
        return send(res, 200, status)
      }
      if (req.method === 'POST' && url === '/submit') {
        if (!String(req.headers['content-type']).startsWith('application/json'))
          return send(res, 415, { ok: false, error: { code: 'bad-request', message: 'Send JSON.' } })
        const input = (await readJson(req)) as SubmitRequest
        return send(res, 200, await submit(input, opts))
      }
      return send(res, 404, { ok: false, error: { code: 'not-found', message: 'Unknown review endpoint.' } })
    } catch (e) {
      const bad = e instanceof ReviewInputError
      if (!bad) opts.log(`error: ${(e as Error).stack ?? e}`)
      return send(res, bad ? 400 : 500, { ok: false, error: { code: bad ? 'bad-request' : 'error', message: (e as Error).message } })
    }
  })
}

async function submit(input: SubmitRequest, opts: MiddlewareOptions): Promise<SubmitResponse> {
  if (!input || typeof input !== 'object') throw new ReviewInputError('The request must be an object.')
  // Check the state again on the server. Do not trust the browser.
  const ctx = await loadContext(opts.context())
  if (!ctx.canSubmit || !ctx.commitId) {
    const why = ctx.problem?.message ?? (ctx.warnings.map((w) => w.message).join(' ') || 'Cannot submit now.')
    return { ok: false, error: { code: ctx.problem?.code ?? 'blocked', message: why } }
  }
  const { payload, outside } = buildReviewPayload({
    commitId: ctx.commitId,
    event: input.event,
    body: input.body ?? '',
    comments: input.comments,
    commentable: ctx.commentable
  })

  if (ctx.dryRun) {
    const target = ctx.pr ? `${ctx.repo}#${ctx.pr.number}` : `${ctx.repo ?? '(no repo)'} (no PR found)`
    opts.log(`DRY RUN: review for ${target}. Not sent to GitHub.\nPOST repos/${ctx.repo ?? '{owner}/{repo}'}/pulls/${ctx.pr?.number ?? '{n}'}/reviews\n${JSON.stringify(payload, null, 2)}`)
    return { ok: true, dryRun: true, payload, outsideDiff: outside.length }
  }

  const { url } = await postReview(opts.context().gitRoot!, ctx.repo!, ctx.pr!.number, payload)
  opts.log(`posted review to ${ctx.repo}#${ctx.pr!.number}: ${url ?? ''}`)
  return { ok: true, dryRun: false, url, outsideDiff: outside.length }
}
