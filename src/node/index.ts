import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { SiteConfig } from 'vitepress'
import type { Plugin, ResolvedConfig } from 'vite'
import type { UserConfig } from 'vitepress'
import { docReviewMarkdown } from './markdown.js'
import { agentSink } from './agent.js'
import { installReviewMiddleware } from './server.js'

export { docReviewMarkdown, lineOffset, mapLines } from './markdown.js'
export { parsePatch, commentableFromFiles } from './diff.js'
export { buildAgentFeedback, buildReviewPayload, commentBody, ReviewInputError } from './payload.js'
export { setAgentSink } from './agent.js'
export { isAllowedRequest } from './server.js'
export type * from '../shared/types.js'

const PKG = 'vitepress-plugin-doc-review'

export interface DocReviewOptions {
  /** Turn the plugin on or off. Default: true. */
  enabled?: boolean
  /** Base branch or commit for change navigation. Default: PR base or the default branch. */
  base?: string
  /** Log the review payload in the dev server terminal and do not send it to GitHub. Default: false. */
  dryRun?: boolean
  /** GitHub repository as `owner/name`. Default: detect it with `gh repo view`. */
  repo?: string
}

interface State {
  serve: boolean
  gitRoot: string | null
  srcDir: string
  site?: SiteConfig
}

function findGitRoot(dir: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return fs.realpathSync(out.trim())
  } catch {
    return null
  }
}

const log = (msg: string) => console.log(`\x1b[36m[doc-review]\x1b[0m ${msg}`)

/** The Vite plugin. It runs only with the dev server (`apply: 'serve'`). */
function reviewVitePlugin(state: State, options: DocReviewOptions): Plugin {
  return {
    name: 'vitepress-plugin-doc-review',
    apply: 'serve',
    config() {
      state.serve = true
    },
    configResolved(config: ResolvedConfig) {
      // VitePress puts its resolved site config on the Vite config.
      const site = (config as ResolvedConfig & { vitepress?: SiteConfig }).vitepress
      state.site = site
      state.srcDir = site?.srcDir ?? config.root
      state.gitRoot = findGitRoot(state.srcDir)
      if (!state.gitRoot) log('the docs are not in a git repository. Comments cannot be placed.')
    },
    configureServer(server) {
      installReviewMiddleware(server, {
        log,
        context: () => ({
          gitRoot: state.gitRoot,
          srcDir: state.srcDir,
          repo: options.repo,
          base: options.base,
          pages: Object.fromEntries((state.gitRoot ? state.site?.pages ?? [] : []).map((file) => {
            const site = state.site!
            const route = (site.rewrites.map[file] ?? file).replace(/\.md$/, site.cleanUrls ? '' : '.html').replace(/(^|\/)index(?:\.html)?$/, '$1')
            return [path.relative(state.gitRoot!, path.join(state.srcDir, file)).split(path.sep).join('/'), site.site.base + route.split('/').map(encodeURIComponent).join('/')]
          })),
          dryRun: !!options.dryRun,
          agent: !!agentSink()
        })
      })
      if (agentSink()) log('agent mode: submit sends the review to the doc-review command.')
      else if (options.dryRun) log('dry-run mode: reviews are logged here and not sent to GitHub.')
    }
  }
}

/**
 * Add the review plugin to a VitePress config: the markdown-it rule that adds
 * source lines, and the dev server endpoints under `/__review/`. Both do
 * nothing in `vitepress build`.
 *
 * ```ts
 * export default withReview(defineConfig({ ... }), { dryRun: true })
 * ```
 */
export function withReview<T extends UserConfig<any>>(config: T, options: DocReviewOptions = {}): T {
  if (options.enabled === false) return config
  const state: State = { serve: false, gitRoot: null, srcDir: process.cwd() }

  const userMd = config.markdown?.config
  const vite = config.vite ?? {}
  const exclude = [...(vite.optimizeDeps?.exclude ?? []), PKG, `${PKG}/client`]
  const noExternal = vite.ssr?.noExternal

  return {
    ...config,
    markdown: {
      ...config.markdown,
      config(md) {
        userMd?.(md)
        docReviewMarkdown(md, { gitRoot: () => state.gitRoot, isEnabled: () => state.serve })
      }
    },
    vite: {
      ...vite,
      plugins: [...(vite.plugins ?? []), reviewVitePlugin(state, options)],
      // Do not pre-bundle the client, so `import.meta.env.DEV` stays in the code
      // and the review UI is removed from production builds.
      optimizeDeps: { ...vite.optimizeDeps, exclude },
      // Bundle the client for SSR too. Node cannot run it directly, because it
      // reads `import.meta.env`, which only Vite supplies.
      ssr: {
        ...vite.ssr,
        noExternal: noExternal === true ? true : [...(noExternal ? [noExternal].flat() : []), PKG]
      }
    }
  }
}

export default withReview
