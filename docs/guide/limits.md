---
title: Limits
description: What the plugin cannot do.
---

# Limits

## Only lines in the diff

GitHub accepts a review comment only on a line in the diff of the PR. If a
comment is on a line that is not in the diff, the plugin puts it in the review
body as `path:line: comment`. The plugin does not drop the comment.

If a comment on a range of lines is only partly in the diff, the plugin makes
the range smaller. The comment then tells the initial range.

## Dev mode only

The review mode does not operate in a production build or in
`vitepress preview`.

## Local state must agree with the PR

If your local HEAD is not the head of the PR, the plugin blocks the submit. If
a docs file has changes that you did not commit and push, the plugin blocks
the submit.

## Includes and dynamic routes

A page that uses `<!--@include: -->` has text that is not in the .md file. A
dynamic route also makes text that is not in the .md file. On these pages, the
plugin turns off comments. See the [page with an include](../testing/fixtures/include.md).

## Raw HTML and Vue components

Raw HTML blocks and Vue components in the markdown do not get source lines.
You cannot comment on them.

## Approval of your own PR

GitHub does not let you approve your own PR. The panel shows the error from
GitHub.

## One draft for each browser

The plugin keeps one pending review for each browser, not for each branch. If
you change the branch, the panel shows a warning.
