---
title: Getting started
description: Install the plugin and add it to a VitePress site.
---

# Getting started

## Before you start

Make sure that you have these items:

- A VitePress 1.x site in a git repository on GitHub.
- The GitHub CLI. Get it from <https://cli.github.com>.

Log in to GitHub with the CLI one time:

```sh
gh auth login
```

## Install the plugin

Install the package as a development dependency:

```sh
npm install --save-dev vitepress-plugin-doc-review
```

## Change the config file

Wrap the config in `withReview` in `.vitepress/config.mts`:

```ts
import { defineConfig } from 'vitepress'
import { withReview } from 'vitepress-plugin-doc-review'

export default withReview(
  defineConfig({
    title: 'My docs'
  }),
  { dryRun: false }
)
```

If the config has a `markdown.config` function, `withReview` keeps it and
calls it first.

## Change the theme file

Wrap the theme in `withReviewTheme` in `.vitepress/theme/index.ts`:

```ts
import DefaultTheme from 'vitepress/theme'
import { withReviewTheme } from 'vitepress-plugin-doc-review/client'

export default withReviewTheme(DefaultTheme)
```

For a custom theme, wrap your theme object in the same way. If your theme has
its own `enhanceApp`, you can call `enhanceAppWithReview(ctx)` in it instead.

## Start the dev server

1. Check out the branch of the PR.
2. Start the dev server with `npx vitepress dev docs`.
3. Open a page and select text.

If the **Comment** button shows, the plugin operates. Read
[Do a review](./reviewing.md) for the next steps.

::: tip
Set `dryRun: true` for the first test. Then the server writes the review in
the terminal and does not send it to GitHub.
:::
