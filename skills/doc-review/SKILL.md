---
name: doc-review
description: Open the VitePress docs of this project in the browser with the doc-review UI. The user selects text, writes comments, and submits. Then act on the returned comments.
allowed-tools: Bash(npx doc-review:*)
---

# Doc review

## Review from the browser

!`npx doc-review $ARGUMENTS`

## Your task

The output above is one of these:

1. The exact text `The user approved.` The user read the docs and has no comments. Say "Approved." in one sentence and stop. Do not start work.
2. The exact text `The user closed the review without feedback.` The user stopped the review. Say "Review closed." in one sentence and stop. Do not start work.
3. A markdown document that starts with `# Docs review`. Each `###` heading is `path:line` or `path:start-end`. The path is relative to the git root that the document names. The lines are lines in the .md source file. A `>` quote under a heading is the text that the user selected. The text after the quote is the comment. Do what each comment asks. Edit the .md source files, not the rendered HTML. If a `## Summary` section exists, it applies to the full review.
4. An error message from `doc-review`, for example "has no .vitepress directory". If the user named the docs in natural language, find the VitePress source directory (the directory that contains `.vitepress/`). Then run `npx doc-review <that-directory>` yourself, and use its output as in items 1 to 3.
