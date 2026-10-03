import DefaultTheme from 'vitepress/theme'
// A real site imports from 'vitepress-plugin-doc-review/client'.
import { withReviewTheme } from '../../../src/client/index.js'

export default withReviewTheme(DefaultTheme)
