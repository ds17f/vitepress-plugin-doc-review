---
title: Endpoints
description: The dev server endpoints under /__review/.
---

# Endpoints

The endpoints exist only on the dev server. Each request must have the
`X-Doc-Review: 1` header. Read [Security](../../guide/security.md) for all of
the request checks.

## GET /__review/pr

Gets the PR of the current branch and the lines that you can comment on.
If the branch has no open PR, `mode` is `issue`. Then the submit opens an
issue.

The server runs these commands:

```sh
gh repo view --json nameWithOwner
gh pr view --json number,url,headRefOid,state
gh api repos/{owner}/{repo}/pulls/{n}/files --paginate --slurp
git rev-parse HEAD
git branch -r --contains HEAD   # issue mode only
git status --porcelain -- <docs directory>
```

Example response:

```json
{
  "dryRun": false,
  "mode": "review",
  "repo": "octo/docs",
  "branch": "update-guide",
  "pr": { "number": 42, "url": "https://github.com/octo/docs/pull/42", "headRefOid": "3f2c..." },
  "commentable": { "docs/guide/intro.md": [{ "start": 1, "end": 14 }] },
  "warnings": [],
  "problem": null,
  "canSubmit": true
}
```

`commentable` is `null` when no PR is available. Then all lines are
commentable.

In issue mode, `linkCommit` is the commit that the issue links to. It is
`null` if no remote branch contains HEAD. In issue mode, `warnings` do not
block the submit.

| Problem code | Cause |
| --- | --- |
| `gh-missing` | The GitHub CLI is not installed. |
| `gh-auth` | The GitHub CLI has no login. |
| `no-repo` | `gh` cannot find the GitHub repository. |
| `not-git` | The docs are not in a git repository. |
| `gh-error` | Another `gh` command failed. |

## POST /__review/submit

Sends the review. The request must have an `Origin` header of the dev server
and the `Content-Type: application/json` header.

Example request:

```json
{
  "event": "COMMENT",
  "body": "Some small changes.",
  "comments": [
    { "id": "1", "path": "docs/guide/intro.md", "startLine": 3, "line": 5, "body": "Make this shorter.", "quote": "The selected text" }
  ]
}
```

The server sends this payload to `repos/{owner}/{repo}/pulls/{n}/reviews`:

```json
{
  "commit_id": "3f2c...",
  "event": "COMMENT",
  "body": "Some small changes.",
  "comments": [
    {
      "path": "docs/guide/intro.md",
      "start_line": 3,
      "start_side": "RIGHT",
      "line": 5,
      "side": "RIGHT",
      "body": "> The selected text\n\nMake this shorter."
    }
  ]
}
```

In issue mode, the request can also have a `title`. The server ignores
`event`. It sends this payload to `repos/{owner}/{repo}/issues`:

```json
{
  "title": "Docs review: update-guide",
  "body": "Some small changes.\n\n---\n\n## Comments\n\n### [docs/guide/intro.md:3-5](https://github.com/octo/docs/blob/3f2c.../docs/guide/intro.md?plain=1#L3-L5)\n\n> The selected text\n\nMake this shorter.\n\n---\n\n_Review of branch `update-guide` at `3f2c...`. The branch has no open pull request._"
}
```
