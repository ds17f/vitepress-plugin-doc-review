---
name: doc-review
description: Open the VitePress docs of this project in the browser with the doc-review UI. The user selects text, writes comments, and submits. Then act on the returned comments.
allowed-tools: Bash(*/node_modules/.bin/doc-review:*), Bash(node_modules/.bin/doc-review:*)
---

# Doc review

The `doc-review` command starts the VitePress dev server and opens the browser. The user writes comments on the rendered pages. When the user submits, the command writes the review on stdout and ends.

Arguments from the user: `$ARGUMENTS`

## 1. Find the docs and the command

1. Find the VitePress source directory. It is the directory that contains `.vitepress/`. If the arguments name a directory, use it. Else, look in `docs/` and in the current directory first.
2. Find the `doc-review` command. It is at `node_modules/.bin/doc-review` in the docs directory or in a parent directory of it. For example, `docs/node_modules/.bin/doc-review` or `node_modules/.bin/doc-review`.
3. If the current project is the plugin itself (`package.json` has the name `vitepress-plugin-doc-review`), run `npm run build`. Then use `node dist/node/cli.js` as the command.
4. If you cannot find the command, the project does not have the plugin. Tell the user to run `npm install --save-dev github:ds17f/vitepress-plugin-doc-review` in the npm project of the docs and to add the plugin to the VitePress config. Then stop. Do not install a package named `doc-review` from the npm registry: that is not this plugin.

## 2. Start the review

Run the command with the Bash tool, from the current directory. Give the path of the command and the docs directory. Set `run_in_background: true`, because the command ends only when the user submits. Example:

```sh
docs/node_modules/.bin/doc-review docs
```

Add the other arguments from the user, for example `--port 5180`. Then tell the user in one sentence that the review is open in the browser. Do not read the output and do not poll it. Wait for the notification that the command ended.

## 3. Use the review

When the command ends, read its stdout. The stderr has only the server logs. The output is one of these:

1. The exact text `The user approved.` The user read the docs and has no comments. Say "Approved." in one sentence and stop. Do not start work.
2. The exact text `The user closed the review without feedback.` The user stopped the review. Say "Review closed." in one sentence and stop. Do not start work.
3. A markdown document that starts with `# Docs review`. Each `###` heading is `path:line` or `path:start-end`. The path is relative to the git root that the document names. The lines are lines in the .md source file. A `>` quote under a heading is the text that the user selected. The text after the quote is the comment. Do what each comment asks. Edit the .md source files, not the rendered HTML. If a `## Summary` section exists, it applies to the full review.
4. No review, and an error in stderr. For example, "has no .vitepress directory" means that the docs directory is not correct. Correct the problem and start the review again. If you cannot correct it, tell the user the error.
