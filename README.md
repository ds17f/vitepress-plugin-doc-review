# vitepress-plugin-doc-review

This plugin adds a review mode to a VitePress site. The review mode works the
same as a line comment in a GitHub pull request (PR) review. It operates only
when the VitePress dev server runs.

A reviewer opens a page on the dev server and selects text. The reviewer
writes a comment on the text. The comments collect in a pending review. At
submit, the plugin sends all of the comments to the open PR of the current git
branch as one GitHub review. Each comment is on the correct file and line, so
it shows in the "Files changed" tab of the PR.

If the branch has no open PR, the plugin opens a GitHub issue. The issue
contains all of the comments. See [Without an open PR](#without-an-open-pr).

The plugin can also give the review to a coding agent, for example Claude
Code. See [Send the review to an agent](#send-the-review-to-an-agent).

The full documentation is a VitePress site in `docs/`. The site also uses the
plugin, so you can use it to test the plugin. See
[Run the docs site](#run-the-docs-site).

## Requirements

| Item | Why the plugin needs it |
| --- | --- |
| VitePress 1.x and Vue 3 | These are peer dependencies. |
| Node.js 18 or later | The dev server and the build run on Node.js. |
| The GitHub CLI (`gh`) | The dev server uses `gh` to get the PR and to send the review. Get it from <https://cli.github.com>. |
| A `gh` login | Run `gh auth login` one time. The dev server uses this login. |
| A git repository on GitHub | The docs must be in the repository. The docs directory can be at any depth. |
| An open PR for the current branch | The review goes to this PR. Without an open PR, the comments go to a new issue. |

The plugin has no other runtime dependencies.

## Install

Install the package as a development dependency:

```sh
npm install --save-dev github:ds17f/vitepress-plugin-doc-review
```

The package is not on the npm registry. npm gets it from GitHub and builds it.

## Add the plugin to a site

You must change 2 files.

In `.vitepress/config.mts`, wrap the config in `withReview`:

```ts
import { defineConfig } from 'vitepress'
import { withReview } from 'vitepress-plugin-doc-review'

export default withReview(defineConfig({ title: 'My docs' }), { dryRun: false })
```

In `.vitepress/theme/index.ts`, wrap the theme in `withReviewTheme`:

```ts
import DefaultTheme from 'vitepress/theme'
import { withReviewTheme } from 'vitepress-plugin-doc-review/client'

export default withReviewTheme(DefaultTheme)
```

For a custom theme, wrap your theme object in the same way. If your theme has
its own `enhanceApp`, you can call `enhanceAppWithReview(ctx)` in it instead.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Set to `false` to turn off the plugin. |
| `dryRun` | `boolean` | `false` | Write the review payload in the dev server terminal. Do not send it to GitHub. |
| `base` | `string` | PR base or default branch | Base branch or commit for the Changes tab. Can be overridden in the panel. |
| `repo` | `string` | Detected with `gh repo view` | The GitHub repository as `owner/name`. |

## How it works

The plugin has 3 parts.

### 1. The markdown rule

A markdown-it rule adds these attributes to each block element in the HTML:

- `data-source-file`: the path of the .md file, relative to the root of the
  git repository.
- `data-source-line` and `data-source-end`: the first line and the last line
  of the block in the .md file.

VitePress removes the frontmatter before markdown-it reads the page. The rule
adds the length of the frontmatter to each line number. Thus a line number in
the HTML is the same line in the .md file.

Vue changes each line break in a paragraph to a space. Thus the rule puts an
empty `<wbr data-source-br>` element at each line break. The UI counts these
elements to find the exact line of a selection in a paragraph.

The rule operates only when the dev server runs.

### 2. The review UI

The review UI is a Vue app. It shows:

- A **Comment** button when you select text. A selection over 2 or more
  blocks gives a comment on a range of lines.
- A **Review** button at the bottom right. It opens the pending review panel.
  In the panel, you can edit or delete each comment, write a summary, and
  select **Comment**, **Approve**, or **Request changes**.
- A **Changes** tab with branch commits, a selectable comparison start,
  grouped changes, page navigation, and expandable source diffs. Comparisons
  end at the current files and include uncommitted Markdown changes.
- A gray bar on the left of each block that is not in the PR diff.
- An **Issue title** box in place of the review types, if the branch has no
  open PR.

The UI keeps the draft in `localStorage`, so a page reload does not delete the
comments. The styles use the VitePress CSS variables, so the UI works in the
light theme and in the dark theme.

The UI code is behind `import.meta.env.DEV`. A production build does not
contain it.

### 3. The server endpoints

A Vite plugin with `apply: 'serve'` adds endpoints to the dev server:

- `GET /__review/pr` gets the PR of the current branch with `gh pr view`. It
  gets the lines that you can comment on from the patches in
  `gh api repos/{owner}/{repo}/pulls/{n}/files`. It also does the local
  checks.
- `GET /__review/changes` gets the branch commits and changed Markdown regions
  from local Git. It keeps actual edits separate from commentable PR context.
- `POST /__review/submit` does the checks again. Then it sends the review to
  `repos/{owner}/{repo}/pulls/{n}/reviews` with `gh api`. If the branch has no
  open PR, it sends an issue to `repos/{owner}/{repo}/issues`.

The server runs `gh` with `execFile` and an argument array. It does not use a
shell. It sends the review JSON on stdin with `--input -`.

## Without an open PR

The plugin opens an issue in these conditions:

- The current branch has no PR.
- The PR of the current branch is closed or merged.
- HEAD is detached and you set the `repo` option.

The issue has a title, the summary, and the comments in file and line order.
Each comment has the file, the lines, the selected text, and the comment.
If you do not write a title, the title is `Docs review: <branch>`.

If HEAD is on a remote branch, each file and line is a link to those lines at
that commit. If you did not push HEAD, the issue has no links. The panel shows
a warning, but you can submit.

## Send the review to an agent

The `doc-review` command starts the dev server in agent mode and opens the
browser. In agent mode, the review does not go to GitHub. When you click
**Send to agent**, the command writes the review on stdout. Then the server
stops and the command ends. Agent mode does not use `gh`, a PR, or a push.

```sh
npx doc-review docs           # the review as markdown
npx doc-review docs --json    # the review as JSON
```

The command writes all of the logs on stderr. Thus stdout has only the review.
If you submit with no comments and no summary, the output is
`The user approved.` If you click **Close without feedback**, the output is
`The user closed the review without feedback.`

The markdown output has one section for each comment, in file and line order.
Each heading is `path:line` or `path:start-end`. Each path is relative to the
git root. The line numbers are the lines in the .md file.

The options are `--port <n>`, `--host <host>`, `--no-open`, and `--json`. Run
`npx doc-review --help` to see all of the options.

### Use it in Claude Code

The package has a Claude Code skill. Install the skill one time:

```sh
npx doc-review install-skill            # for this project: .claude/skills/doc-review
npx doc-review install-skill --global   # for all projects: ~/.claude/skills/doc-review
```

Then type `/doc-review` in Claude Code. To give the docs directory, type
`/doc-review docs`. The skill runs `doc-review` and waits for the review. Then
the agent does the changes in the .md files. The plugin can be in a
subdirectory of the project, for example `docs/`. The skill finds the command
in `node_modules/.bin`.

If you install a new version of the plugin, run `install-skill` again. If your
copy of the skill is different, add `--force` to replace it.

A global skill works only in a project that has the plugin installed. In
other projects, the skill tells you to install the plugin. It does not get a
package from the npm registry.

## Limits

- **Only lines in the diff.** GitHub accepts a comment only on a line in the
  PR diff. The plugin puts a comment on another line in the review body as
  `path:line: comment`. It does not drop the comment.
- **Dev mode only.** The review mode does not operate in a production build or
  in `vitepress preview`.
- **Local state must agree with the PR.** If your local HEAD is not the head
  of the PR, or a docs file has changes that you did not push, the line
  numbers can be incorrect. The UI shows a warning and blocks the submit.
- **Includes and dynamic routes.** On a page that uses `<!--@include: -->` or
  a dynamic route, the plugin turns off comments.
- **Raw HTML and Vue components** in the markdown do not get source lines.
- **Problems with `gh`.** If `gh` is not installed, has no login, or cannot
  find the repository, the UI shows the problem. The comments stay as a local
  draft.

## Security model

- **No tokens.** The package, the site, and the browser do not contain a
  token. The dev server uses the `gh` login of the person who starts it.
- **Only the dev server can send requests.** The server refuses a request if
  the `Origin` header or the `Host` header is not the dev server. It also
  refuses a request without the `X-Doc-Review: 1` header. Thus other websites
  in the browser cannot post reviews or issues, and DNS rebinding attacks do not work.
- **No shell.** Text from the browser never goes into a command line.
- **Input checks.** The server checks each path and line. At submit, it gets
  the PR and the local state again.
- **Network access.** If you start the dev server with `--host`, other
  computers on the network can submit a review or open an issue with your `gh` login. Use
  `--host` only on a network that you trust.

## Run the docs site

The `docs/` directory has the documentation of the plugin. The site uses the
plugin from `src/`, so it needs no build step.

```sh
npm install
npm run docs:dev        # the docs site with the review UI
npm run docs:dev:dry    # the docs site in dry-run mode: no requests to GitHub
npm run docs:agent      # build, then review the docs site in agent mode
npm run docs:build      # a production build of the docs site
npm run docs:preview    # serve the production build
```

The pages in `docs/testing/` are fixtures for the tests. Do not change their
text, because the automated tests use it. The other pages are real content.

## Test the plugin

```sh
npm test               # unit tests
npm run test:build     # build the docs site and make sure it has no review code
npm run test:e2e       # dry-run test in headless Chromium
npm run typecheck      # TypeScript check
npm run build          # compile the package to dist/
```

The unit tests check the line of each block on each page of the docs site.
They also check the diff parser, the review payload, the request checks, and
the `gh` calls with a fake `gh`.

The end-to-end test starts the docs site in dry-run mode. It selects text on
the fixture pages, submits, and reads the payload from the server output. It
makes sure that each `path` and `line` points to the selected text. It needs
Chromium. Set `CHROME_PATH`, or install a browser in the Playwright cache.

To do the first test with a real PR, read `docs/testing/index.md`.

## Use make

The `Makefile` has targets for the same tasks. Run `make help` to see all of
the targets. For example:

```sh
make check   # TypeScript check and unit tests
make ci      # all checks, the build, and all tests
make dev     # the docs site with the review UI
```

Each target installs the dependencies first if `package-lock.json` changed.
