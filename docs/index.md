---
layout: home
hero:
  name: Doc Review
  text: Review VitePress docs like a pull request
  tagline: Select text on a page, write a comment, and send all comments to the GitHub pull request as one review.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: How it works
      link: /guide/how-it-works
features:
  - title: Comments on the correct line
    details: Each comment goes to the correct file and line, so it shows in the "Files changed" tab of the pull request.
  - title: Dev mode only
    details: The review UI and the endpoints operate only with the dev server. A production build does not contain them.
  - title: No tokens
    details: The dev server uses your gh login. The site and the browser never get a token.
---

## Try it on this site

This site uses the plugin. Start it with `npm run docs:dev`. Then select text
on a page and click **Comment**.

Use `npm run docs:dev:dry` to test without GitHub. In dry-run mode, the
server writes the review in the terminal and does not send it.
