---
title: Exports
description: The functions that the package exports.
---

# Exports

## vitepress-plugin-doc-review

The Node.js entry point. Use it in `.vitepress/config.mts`.

| Export | Description |
| --- | --- |
| `withReview(config, options)` | Adds the markdown rule and the Vite plugin to a VitePress config. |
| `docReviewMarkdown(md, options)` | The markdown-it plugin alone. |
| `parsePatch(patch)` | Gets the new-side line ranges from a unified diff patch. |
| `buildReviewPayload(input)` | Makes the body of the GitHub review request. |
| `isAllowedRequest(req, hosts, port)` | The request check of the endpoints. |

## vitepress-plugin-doc-review/client

The browser entry point. Use it in `.vitepress/theme/index.ts`.

| Export | Description |
| --- | --- |
| `withReviewTheme(theme)` | Returns the theme with the review UI added to `enhanceApp`. |
| `enhanceAppWithReview(ctx)` | Adds the review UI. Call it from your own `enhanceApp`. |

Both functions do nothing in a production build and during server-side
rendering.
