---
title: Do a review
description: The steps to write and submit a review.
---

# Do a review

## Write comments

1. Open a page on the dev server.
2. Select the text that you want to comment on.
3. Click **Comment**.
4. Write the comment.
5. Click **Add to review**. You can also push <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.

Do these steps again for each comment. The comments collect in the pending
review. The **Review** button at the bottom right shows the number of
comments.

A selection in one block gives a comment on one line. A selection over 2 or
more blocks gives a comment on a range of lines.

## Read the marks on the page

| Mark | Meaning |
| --- | --- |
| Gray bar on the left | The block is not in the PR diff. A comment on it goes in the review body. |
| Yellow background | The block has a comment in the pending review. |

## Edit the pending review

1. Click **Review** to open the panel.
2. Click the file and line of a comment to go to the block on the page.
3. Click **Edit** to change a comment, or **Delete** to remove it.

The plugin keeps the pending review in the browser. A page reload does not
delete it.

## Submit the review

1. Write a summary. A summary is necessary for **Request changes**.
2. Select **Comment**, **Approve**, or **Request changes**.
3. Click **Submit review**.

When GitHub accepts the review, the panel shows a link to it. Then the plugin
deletes the pending review.

::: warning
If the panel shows a warning, the line numbers can be incorrect. The plugin
blocks the submit. Correct the problem, then click **Reload PR**.
:::

## Submit without an open PR

If the current branch has no open PR, the panel shows a tip. The submit then
opens one GitHub issue with all of the comments. The plugin also does this if
the PR is closed or merged.

1. Write a title in **Issue title**. If you do not write a title, the title is
   `Docs review: <branch>`.
2. Write a summary. The summary is optional.
3. Click **Open issue**.

When GitHub accepts the issue, the panel shows a link to it. Then the plugin
deletes the pending review.

The issue has the comments in file and line order. If HEAD is on a remote
branch, each file and line is a link to those lines at that commit.

::: tip
If you did not push HEAD, the issue has no links to the lines. The panel shows
a warning, but you can submit. Push your branch, then click **Reload PR**, to
add the links.
:::
