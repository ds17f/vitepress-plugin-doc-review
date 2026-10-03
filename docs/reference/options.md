---
title: Options
description: The options of withReview.
---

# Options

Give the options as the second argument of `withReview`:

```ts
export default withReview(defineConfig({}), {
  enabled: true,
  dryRun: false,
  repo: 'owner/name'
})
```

## enabled

- Type: `boolean`
- Default: `true`

Set to `false` to turn off the plugin. Then `withReview` returns the config
with no changes.

## dryRun

- Type: `boolean`
- Default: `false`

In dry-run mode, the server writes the review payload in the dev server
terminal. It does not send the review to GitHub. The panel also shows the
payload.

If the branch has no open PR, the dry run writes the issue payload. If the
plugin cannot find the GitHub repository, the dry run writes a review payload.
It uses all lines as lines in the diff. Thus you can examine the payload before
you open a PR.

You can set the option from an environment variable:

```ts
withReview(config, { dryRun: !!process.env.DOC_REVIEW_DRY_RUN })
```

## repo

- Type: `string`
- Default: the repository that `gh repo view` finds

The GitHub repository as `owner/name`. Use this option if `gh` cannot find the
correct repository, for example in a fork.
