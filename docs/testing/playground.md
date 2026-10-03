---
title: Playground
description: >
  A fixture page for the tests.
  The description is a folded block,
  so the frontmatter has more lines.
tags:
  - fixture
  - test
outline: deep
---

# Playground

This page has frontmatter. The frontmatter is eleven lines long, so the first
heading is on line 13 of the source file.

## Install

Install the package with npm:

```sh
npm install --save-dev example-tool
```

## First run

Run the tool from the root of your project:

```js
import { run } from 'example-tool'

const result = await run({
  input: 'src',
  output: 'dist'
})

console.log(result.files)
```

::: tip
The tool reads `example.config.js` when it exists.
:::

## A paragraph on three lines

A paragraph with *emphasis*, `inline code`, and a [link](./plain.md).
It continues on a second source line,
and on a third source line.

## Next steps

- Read the [page without frontmatter](./plain.md).
- See the [nested page](./fixtures/deep/nested-page.md).
