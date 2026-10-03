---
title: Security
description: The security model of the plugin.
---

# Security

## No tokens

The package, the site, and the browser do not contain a token. The dev server
uses the `gh` login of the person who starts it.

## Requests from other websites

Other websites in the same browser can send requests to `localhost`. The
server refuses a request in these conditions:

- The `Origin` header is not the dev server. A `POST` request must have an
  `Origin` header.
- The `Host` header is not a name of the dev server. This stops DNS
  rebinding attacks.
- The request does not have the `X-Doc-Review: 1` header. A cross-origin
  request with this header needs a CORS preflight. The server never allows
  the preflight.
- The `Sec-Fetch-Site` header is present and is not `same-origin`.

## No shell

The server runs `gh` and `git` with `execFile` and an argument array. Text
from the browser never goes into a command line. The review JSON goes to
`gh api` on stdin with `--input -`.

## Input checks

The server checks each comment before it sends the review:

- The path must not start with `/` and must not contain `..`.
- The line numbers must be positive integers.
- The start line must not be after the end line.
- The comment must not be empty or too long.

At submit, the server gets the PR and the local state again. It does not trust
the data from the browser.

## Network access

::: danger
If you start the dev server with `--host`, other computers on the network can
open the site. They can then submit a review with your `gh` login. Use
`--host` only on a network that you trust.
:::
