import { defineConfig } from 'vitepress'
// A real site imports from 'vitepress-plugin-doc-review'. This site uses the
// source in this repository, so it needs no build step.
import { withReview } from '../../src/node/index.js'

export default withReview(
  defineConfig({
    title: 'Doc Review',
    description: 'PR-style review comments on a VitePress site, posted to GitHub.',
    cleanUrls: true,
    // Files that start with "_" are parts for @include. They are not pages.
    srcExclude: ['**/_*.md'],
    themeConfig: {
      nav: [
        { text: 'Guide', link: '/guide/introduction' },
        { text: 'Reference', link: '/reference/options' },
        { text: 'Testing', link: '/testing/' }
      ],
      sidebar: [
        {
          text: 'Guide',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Do a review', link: '/guide/reviewing' },
            { text: 'Send a review to an agent', link: '/guide/agent' },
            { text: 'How it works', link: '/guide/how-it-works' },
            { text: 'Limits', link: '/guide/limits' },
            { text: 'Security', link: '/guide/security' }
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'Options', link: '/reference/options' },
            { text: 'Exports', link: '/reference/api/exports' },
            { text: 'Endpoints', link: '/reference/api/endpoints' }
          ]
        },
        {
          text: 'Testing',
          items: [
            { text: 'Test the plugin', link: '/testing/' },
            { text: 'Playground', link: '/testing/playground' },
            { text: 'Page without frontmatter', link: '/testing/plain' },
            { text: 'Nested page', link: '/testing/fixtures/deep/nested-page' },
            { text: 'Page with an include', link: '/testing/fixtures/include' }
          ]
        }
      ],
      search: { provider: 'local' }
    }
  }),
  {
    dryRun: !!process.env.DOC_REVIEW_DRY_RUN
  }
)
