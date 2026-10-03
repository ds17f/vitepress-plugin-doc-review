---
title: Test the plugin
description: How to use this site to test the plugin.
---

# Test the plugin

This site is the documentation of the plugin. It is also the test site. The
pages in the **Testing** section are fixtures. Do not change their text,
because the automated tests use it.

## The fixtures

| Page | What it tests |
| --- | --- |
| [Playground](./playground.md) | Long frontmatter, multi-line paragraphs, code blocks, a container. |
| [Page without frontmatter](./plain.md) | Line 1 of the file is the first heading. Tables, lists, a quote. |
| [Nested page](./fixtures/deep/nested-page.md) | A page 3 directories deep, with frontmatter. |
| [Page with an include](./fixtures/include.md) | Comments must be off on this page. |

The other pages of the site are real content. The unit tests also check each
block of each page.

## Automated tests

```sh
npm test            # unit tests, including the line check of each page
npm run test:build  # build this site and make sure it has no review code
npm run test:e2e    # dry-run test in headless Chromium
```

The end-to-end test starts this site in dry-run mode. It selects text on the
fixture pages, adds comments, and submits. Then it reads the payload from the
server output. It makes sure that each `path` and `line` points to the selected
text in the .md file. It needs Chromium. Set `CHROME_PATH`, or install a
browser in the Playwright cache.

## Manual test in dry-run mode

1. Start the site with `npm run docs:dev:dry`.
2. Open the [Playground](./playground.md).
3. Select text and add comments.
4. Open the **Review** panel and click **Submit review (dry run)**. If the
   branch has no open PR, the button is **Open issue (dry run)**.
5. Compare the `path` and `line` in the terminal with the .md file.

## The first real test

::: warning
A real test sends content to GitHub. Use a test repository or a draft PR.
:::

1. Push this repository to GitHub.
2. Make a branch and change some lines in `docs/testing/playground.md`.
3. Commit and push the change.
4. Open a draft PR with `gh pr create --draft`.
5. Start the site with `npm run docs:dev:dry`. Make sure that the panel shows
   the PR and no warnings.
6. Submit in dry-run mode. Compare the payload with the diff of the PR.
7. Start the site with `npm run docs:dev`.
8. Add a comment on a changed line and a comment on a line that did not change.
9. Select **Comment** and submit. Do not select **Approve** on your own PR.
10. On GitHub, make sure that the first comment is in "Files changed" and the
    second comment is in the review body.
