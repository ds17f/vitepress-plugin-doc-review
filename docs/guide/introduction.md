---
title: Introduction
description: What the plugin does and who it is for.
---

# Introduction

Doc Review adds a review mode to a VitePress site. The review mode works the
same as a line comment in a GitHub pull request (PR) review.

## The problem

A writer changes the docs in a PR. A reviewer must then read the changes as
a diff of markdown files. A diff does not show the page as the reader sees it.
Tables, code groups, and custom containers are difficult to read in a diff.

## The solution

With this plugin, the reviewer reads the rendered pages on the dev server. The
reviewer selects text and writes a comment on it. The plugin sends the
comments to the PR as one GitHub review. Each comment is on the correct line of
the .md file. The writer sees the comments in the "Files changed" tab, the same
as all other review comments.

## Parts of the plugin

The plugin has 3 parts:

| Part | Where it runs | What it does |
| --- | --- | --- |
| Markdown rule | Node.js, at render time | Adds the source file and line to each block in the HTML. |
| Review UI | Browser, dev mode only | Shows the **Comment** button and the pending review panel. |
| Server endpoints | Vite dev server | Gets the PR data with `gh` and sends the review. |

Read [How it works](./how-it-works.md) for the details.

## Requirements

- VitePress 1.x and Vue 3.
- Node.js 18 or later.
- The GitHub CLI (`gh`), with a login.
- A git repository on GitHub that contains the docs.
- An open PR for the current branch.
