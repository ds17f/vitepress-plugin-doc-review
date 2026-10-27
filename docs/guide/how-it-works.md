---
title: How it works
description: Source lines, the review UI, and the server endpoints.
outline: [2, 3]
---

# How it works

## Overview

1. A markdown-it rule adds the source file and line to each block in the HTML.
2. The reviewer selects text. The UI reads the source data of the selected
   blocks and finds the lines.
3. The UI keeps the comments in `localStorage`.
4. At submit, the UI sends the comments to the dev server.
5. The dev server makes the review payload and sends it with `gh api`.

## Source lines

The markdown rule adds these attributes to each block element:

| Attribute | Value |
| --- | --- |
| `data-source-file` | The path of the .md file, relative to the root of the git repository. |
| `data-source-line` | The first line of the block in the .md file. |
| `data-source-end` | The last line of the block in the .md file. |
| `data-source-kind` | `text`, `fence`, or `code`, for blocks where the UI can find the exact line. |

The path is relative to the root of the git repository, not to the docs
directory. GitHub uses this path in the PR. Thus the docs directory can be at
any depth in the repository.

### The frontmatter correction

VitePress removes the frontmatter before markdown-it reads the page. Thus
markdown-it counts the lines from the end of the frontmatter. The rule keeps
the full source of the page. It adds the number of frontmatter lines to each
line number. Thus a line number in the HTML is the same line in the .md file.

### The exact line in a paragraph

Vue changes each line break in a paragraph to a space. Thus the browser cannot
find the source lines of a paragraph from the text. The rule puts an empty
`<wbr data-source-br>` element at each line break. The UI counts these
elements before the selection to find the exact line.

In a code block, the browser keeps the line breaks. The UI counts them.

In other blocks, such as list items and table rows, the UI uses the line range
of the block.

### Only in the dev server

The rule adds the attributes only when the dev server runs. A production build
has no source attributes.

## The review UI

The UI is a Vue app. The theme mounts it next to the VitePress app. Thus it
works with the default theme and with custom themes.

The code of the UI is behind `import.meta.env.DEV`. In a production build,
Vite changes this value to `false`. The bundler then removes the UI and its
import.

The styles use the VitePress CSS variables. Thus the UI works in the light
theme and in the dark theme.

## The server endpoints

The Vite plugin uses `apply: 'serve'`, so it runs only with the dev server. It
adds endpoints under `/__review/`. Read [Endpoints](../reference/api/endpoints.md)
for the request and response data.

### The commentable lines

GitHub accepts a review comment only on a line in the diff. The server reads
the patch of each file from the GitHub API. It finds the new lines and the
context lines of each hunk. The UI uses these lines to mark the blocks that
are not in the diff.

### The local checks

The line numbers come from the files on your computer. GitHub uses the files
in the PR. If they are different, the lines can be incorrect. Thus the server
does these checks:

- Your local HEAD must be the head commit of the PR.
- The docs directory must have no .md changes that you did not commit.

If a check fails, the server blocks the submit.

### No open PR

If the branch has no open PR, the server uses issue mode. Then no line is
outside the diff, because there is no diff. At submit, the server puts all of
the comments in one issue. It sends the issue to
`repos/{owner}/{repo}/issues` with `gh api`.

The server runs `git branch -r --contains HEAD`. If a remote branch contains
HEAD, the issue has links to the lines at HEAD. In issue mode, the local
checks show warnings, but they do not block the submit.
