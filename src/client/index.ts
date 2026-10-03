import type { EnhanceAppContext, Theme } from 'vitepress'

/**
 * Add the review UI to the app. Call it from a theme's `enhanceApp`.
 *
 * The UI code is behind `import.meta.env.DEV`. A production build replaces it
 * with `false`, so the bundler removes the UI and its dynamic import.
 */
export function enhanceAppWithReview(ctx: EnhanceAppContext): void {
  if (import.meta.env.DEV && !import.meta.env.SSR && typeof window !== 'undefined') {
    import('./ui.js').then((m) => m.mountReview(ctx.router))
  }
}

/**
 * Wrap a theme (the default theme or a custom theme) so it shows the review UI
 * in dev mode.
 *
 * ```ts
 * import DefaultTheme from 'vitepress/theme'
 * import { withReviewTheme } from 'vitepress-plugin-doc-review/client'
 * export default withReviewTheme(DefaultTheme)
 * ```
 */
export function withReviewTheme<T extends Theme>(theme: T): T {
  return {
    ...theme,
    async enhanceApp(ctx: EnhanceAppContext) {
      await theme.enhanceApp?.(ctx)
      enhanceAppWithReview(ctx)
    }
  }
}
