---
title: Send a review to an agent
description: Use the doc-review command to give review comments to a coding agent.
---

# Send a review to an agent

In agent mode, the review does not go to GitHub. It goes to the coding agent
that started the dev server, for example Claude Code. Agent mode does not use
`gh`, a PR, or a push. The agent reads the comments and edits the .md files.

## How agent mode works

The `doc-review` command starts the VitePress dev server and opens the
browser. You write comments on the pages. When you submit, the command writes
the review on stdout. Then the server stops and the command ends.

The command writes all of the logs on stderr. Thus stdout has only the review.

## Start a review from a terminal

1. Go to the root of the project.
2. Run this command:

   ```sh
   npx doc-review docs
   ```

3. Write comments on the pages. Use the steps in [Do a review](./reviewing).
4. Click **Review** to open the panel.
5. Write a summary. The summary is optional.
6. Click **Send to agent**.

If the pending review has no comments and no summary, the button is
**Approve**. An approval gives the text `The user approved.`

If you do not give a directory, the command uses `docs` if it has a
`.vitepress` directory. Else, it uses the current directory.

## Close the review without feedback

1. Click **Review** to open the panel.
2. Click **Close without feedback**.
3. Click **OK** in the confirmation dialog.

The command writes `The user closed the review without feedback.` Then the
server stops. The pending comments stay in the browser as a draft.

## Command options

| Option | Description |
| --- | --- |
| `--port <n>` | The port of the dev server. |
| `--host <host>` | The address of the dev server. Other computers can then see the docs and send a review. |
| `--no-open` | Do not open the browser. |
| `--json` | Write the review as JSON, not as markdown. |

## Use the review in Claude Code

The package has a Claude Code skill. The skill runs `doc-review`, waits for
the review, and then does the changes. The plugin can be in a subdirectory of
the project, for example `docs/`. The skill finds the command in
`node_modules/.bin`.

1. Install the plugin and add it to the site. See
   [Getting started](./getting-started).
2. Install the skill. Run one of these commands in the root of the project:

   ```sh
   npx doc-review install-skill            # for this project only
   npx doc-review install-skill --global   # for all of your projects
   ```

3. In Claude Code, type `/doc-review`. To give the docs directory, type
   `/doc-review docs`.

The first command writes `.claude/skills/doc-review/SKILL.md`. You can commit
this file, so that all of the persons on the project get the skill. The
`--global` command writes `~/.claude/skills/doc-review/SKILL.md`.

If you install a new version of the plugin, run `install-skill` again. If your
copy of the skill is different, add `--force` to replace it.

::: warning
Do not run `npm install doc-review`. The name `doc-review` on the npm registry
does not belong to this plugin. A global skill works only in a project that has the plugin
installed. In other projects, the skill tells you to install the plugin.
:::

## The review output

The markdown output has a summary and one section for each comment. The
sections are in file and line order. Each heading is the file and the lines.
Each path is relative to the git root. The line numbers are the lines in the
.md file.

```md
# Docs review

The user reviewed the rendered docs and left feedback. ...

## Summary

Overall fine.

## Comments

### docs/guide/introduction.md:3-5

> This plugin adds

Make this shorter.
```

The `--json` output has these fields: `decision` (`approved`, `annotated`, or
`dismissed`), `gitRoot`, `branch`, `summary`, `comments`, and `markdown`.

::: tip
The line numbers come from your local files. Thus you can do a review of
changes that you did not commit.
:::
