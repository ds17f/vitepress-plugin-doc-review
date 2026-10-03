import { computed, createApp, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, watch, type VNode } from 'vue'
import type { Router } from 'vitepress'
import { fetchStatus, submitReview } from './api.js'
import { emptyDraft, loadDraft, saveDraft } from './draft.js'
import { BLOCK_SELECTOR, blocksForRange, targetFromSelection, type SelectionTarget } from './selection.js'
import { css } from './style.js'
import { rangeTouchesDiff } from '../shared/lines.js'
import type { DraftComment, PrStatus, ReviewEvent, SubmitResponse } from '../shared/types.js'

const ROOT_ID = 'doc-review-root'

const EVENTS: { value: ReviewEvent; label: string; hint: string }[] = [
  { value: 'COMMENT', label: 'Comment', hint: 'General feedback. Do not approve.' },
  { value: 'APPROVE', label: 'Approve', hint: 'Approve the changes.' },
  { value: 'REQUEST_CHANGES', label: 'Request changes', hint: 'The changes must be fixed before merge.' }
]

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function label(c: { path: string; startLine?: number; line: number }): string {
  return c.startLine && c.startLine !== c.line ? `${c.path}:${c.startLine}-${c.line}` : `${c.path}:${c.line}`
}

/** Blocks without a smaller block inside them. Only these get marks, so a list does not get a mark for each of its items. */
function isLeaf(el: HTMLElement): boolean {
  return !el.querySelector(BLOCK_SELECTOR)
}

interface Composer {
  target: Omit<SelectionTarget, 'anchor'>
  page: string
  text: string
  top: number
  left: number
}

const ReviewApp = defineComponent({
  props: { router: { type: Object as () => Router, required: true } },
  setup(props) {
    const draft = reactive(loadDraft())
    const state = reactive({
      status: null as PrStatus | null,
      loading: true,
      fetchError: '' as string,
      disabled: false,
      sel: null as null | { target: SelectionTarget | null; top: number; left: number; unreliable: boolean },
      composer: null as Composer | null,
      panelOpen: false,
      editing: null as null | { id: string; text: string },
      submitting: false,
      result: null as SubmitResponse | null
    })

    watch(draft, () => saveDraft(draft), { deep: true })

    // `null` means the commentable lines are unknown (dry run without a PR): all lines are allowed.
    const commentable = computed(() => (state.status ? state.status.commentable : {}))
    const inDiff = (path: string, start: number, end: number) =>
      state.status ? rangeTouchesDiff(commentable.value, path, start, end) : true

    async function refresh() {
      state.loading = true
      state.fetchError = ''
      try {
        const s = await fetchStatus()
        if (!s) {
          state.disabled = true
          return
        }
        state.status = s
        if (!draft.branch && s.branch) draft.branch = s.branch
      } catch (e) {
        state.fetchError = `Cannot reach the review server: ${(e as Error).message}`
      } finally {
        state.loading = false
        mark()
      }
    }

    // ----- Block marks ------------------------------------------------------

    let markQueued = false
    function mark() {
      if (markQueued) return
      markQueued = true
      requestAnimationFrame(() => {
        markQueued = false
        const blocks = document.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)
        blocks.forEach((el) => {
          if (el.closest(`#${ROOT_ID}`)) return
          const path = el.getAttribute('data-source-file')!
          const s = Number(el.getAttribute('data-source-line'))
          const e = Number(el.getAttribute('data-source-end'))
          const leaf = isLeaf(el)
          const outside = leaf && !!state.status && !inDiff(path, s, e)
          el.classList.toggle('dr-not-commentable', outside)
          if (outside) el.title = 'Not in the PR diff. A comment here goes in the review body.'
          else if (el.title.startsWith('Not in the PR diff')) el.removeAttribute('title')
          const has = leaf && draft.comments.some((c) => c.path === path && (c.startLine ?? c.line) <= e && c.line >= s)
          el.classList.toggle('dr-has-comment', has)
        })
      })
    }
    watch(() => draft.comments.map((c) => `${c.path}:${c.startLine}:${c.line}`).join(), mark)

    // ----- Selection --------------------------------------------------------

    function inOwnUi(node: EventTarget | Node | null): boolean {
      return node instanceof Node && !!document.getElementById(ROOT_ID)?.contains(node)
    }

    function onPointerUp(ev: Event) {
      if (inOwnUi(ev.target)) return
      // Let the browser finish the selection first.
      setTimeout(readSelection, 0)
    }

    function readSelection() {
      if (state.composer) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        state.sel = null
        return
      }
      const range = sel.getRangeAt(0)
      const doc = (range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement
      )?.closest('.vp-doc')
      if (!doc) {
        state.sel = null
        return
      }
      const rects = range.getClientRects()
      const rect = rects[rects.length - 1] ?? range.getBoundingClientRect()
      const top = rect.bottom + window.scrollY + 6
      const left = Math.min(rect.right + window.scrollX - 40, window.scrollX + document.documentElement.clientWidth - 140)
      const target = targetFromSelection(sel)
      const unreliable = !target && !!document.querySelector('.vp-doc [data-source-unreliable]')
      state.sel = target || unreliable ? { target, top, left: Math.max(left, 8), unreliable } : null
    }

    function onSelectionChange() {
      const sel = window.getSelection()
      if (!state.composer && (!sel || sel.isCollapsed)) state.sel = null
    }

    function openComposer() {
      const s = state.sel
      if (!s?.target) return
      const { anchor: _a, ...target } = s.target
      state.composer = {
        target,
        page: props.router.route.path,
        text: '',
        top: s.top,
        left: Math.max(8, Math.min(s.left - 200, window.scrollX + document.documentElement.clientWidth - 440))
      }
      state.sel = null
      nextTick(() => (document.querySelector('#doc-review-root .dr-composer textarea') as HTMLTextAreaElement | null)?.focus())
    }

    function addComment() {
      const c = state.composer
      if (!c || !c.text.trim()) return
      const comment: DraftComment = {
        id: newId(),
        path: c.target.path,
        line: c.target.line,
        body: c.text.trim(),
        quote: c.target.quote,
        page: c.page
      }
      if (c.target.startLine !== c.target.line) comment.startLine = c.target.startLine
      draft.comments.push(comment)
      if (!draft.branch && state.status?.branch) draft.branch = state.status.branch
      state.composer = null
      state.result = null
      window.getSelection()?.removeAllRanges()
    }

    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        if (state.composer) state.composer = null
        else if (state.panelOpen) state.panelOpen = false
      }
      if (ev.key.startsWith('Arrow') && ev.shiftKey && !inOwnUi(ev.target)) setTimeout(readSelection, 0)
    }

    // ----- Pending review ---------------------------------------------------

    function remove(id: string) {
      const i = draft.comments.findIndex((c) => c.id === id)
      if (i >= 0) draft.comments.splice(i, 1)
    }

    function saveEdit() {
      const e = state.editing
      if (!e) return
      const c = draft.comments.find((x) => x.id === e.id)
      if (c && e.text.trim()) c.body = e.text.trim()
      state.editing = null
    }

    function discardAll() {
      if (!confirm('Delete all pending comments and the summary?')) return
      Object.assign(draft, emptyDraft(), { branch: state.status?.branch ?? null })
      state.result = null
    }

    function flash(c: DraftComment) {
      const els = blocksForRange(c.path, c.startLine ?? c.line, c.line).filter(isLeaf)
      if (!els.length) return false
      els[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
      els.forEach((el) => el.classList.add('dr-flash'))
      setTimeout(() => els.forEach((el) => el.classList.remove('dr-flash')), 1200)
      return true
    }

    async function goTo(c: DraftComment) {
      if (c.page && c.page !== props.router.route.path) {
        await props.router.go(c.page)
        setTimeout(() => flash(c), 300)
      } else flash(c)
    }

    const outsideCount = computed(() =>
      draft.comments.filter((c) => !inDiff(c.path, c.startLine ?? c.line, c.line)).length
    )

    const branchMismatch = computed(() =>
      draft.branch && state.status?.branch && draft.branch !== state.status.branch && draft.comments.length
        ? `This draft was made on branch "${draft.branch}". You are now on "${state.status.branch}". Check the line numbers before you submit.`
        : ''
    )

    const submitBlockedReason = computed(() => {
      const s = state.status
      if (!s) return state.loading ? 'Loading the pull request…' : 'The review server is not available.'
      if (!s.canSubmit) return s.problem?.message ?? 'Fix the warnings, then reload.'
      if (!draft.comments.length && !draft.summary.trim() && draft.event !== 'APPROVE') return 'Add a comment or a summary.'
      if (draft.event === 'REQUEST_CHANGES' && !draft.summary.trim() && !outsideCount.value) return '"Request changes" needs a summary.'
      return ''
    })

    async function submit() {
      if (submitBlockedReason.value) return
      state.submitting = true
      state.result = null
      try {
        const res = await submitReview({
          event: draft.event,
          body: draft.summary,
          comments: draft.comments.map(({ id, path, line, startLine, body, quote }) => ({ id, path, line, startLine, body, quote }))
        })
        state.result = res
        if (res.ok && !res.dryRun) Object.assign(draft, emptyDraft(), { branch: state.status?.branch ?? null })
      } catch (e) {
        state.result = { ok: false, error: { code: 'network', message: (e as Error).message } }
      } finally {
        state.submitting = false
      }
    }

    // ----- Life cycle -------------------------------------------------------

    let observer: MutationObserver | null = null
    onMounted(() => {
      refresh()
      document.addEventListener('mouseup', onPointerUp)
      document.addEventListener('touchend', onPointerUp)
      document.addEventListener('selectionchange', onSelectionChange)
      document.addEventListener('keydown', onKey)
      // VitePress replaces the page content on navigation. Mark the new blocks.
      observer = new MutationObserver((records) => {
        if (records.some((r) => !inOwnUi(r.target))) mark()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    onBeforeUnmount(() => {
      document.removeEventListener('mouseup', onPointerUp)
      document.removeEventListener('touchend', onPointerUp)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('keydown', onKey)
      observer?.disconnect()
    })

    // ----- Render -----------------------------------------------------------

    const note = (kind: string, text: string | VNode[] | VNode) => h('div', { class: ['dr-note', kind] }, text)

    function renderSelectionButton() {
      const s = state.sel
      if (!s || state.composer) return null
      const style = { top: `${s.top}px`, left: `${s.left}px` }
      if (!s.target) {
        return h('div', { class: 'dr-float', style }, [
          h('button', { class: 'dr-comment-btn muted', disabled: true, title: 'This page uses @include or generated content, so its lines do not match the .md file.' }, 'Comments are off on this page')
        ])
      }
      const t = s.target
      const outside = !inDiff(t.path, t.startLine, t.line)
      return h('div', { class: 'dr-float', style }, [
        h(
          'button',
          {
            class: ['dr-comment-btn', outside && 'muted'],
            title: `${label(t)}${outside ? ' (not in the PR diff)' : ''}`,
            onMousedown: (e: Event) => e.preventDefault(),
            onClick: openComposer
          },
          outside ? '💬 Comment (outside diff)' : '💬 Comment'
        )
      ])
    }

    function renderComposer() {
      const c = state.composer
      if (!c) return null
      const t = c.target
      const outside = !inDiff(t.path, t.startLine, t.line)
      return h('div', { class: 'dr-float dr-composer', style: { top: `${c.top}px`, left: `${c.left}px` } }, [
        h('div', { class: 'dr-loc' }, label(t)),
        t.quote ? h('div', { class: 'dr-quote' }, t.quote) : null,
        outside ? note('warning', 'These lines are not in the PR diff. GitHub cannot attach the comment to them, so it goes in the review body.') : null,
        h('textarea', {
          value: c.text,
          placeholder: 'Leave a comment',
          onInput: (e: Event) => (c.text = (e.target as HTMLTextAreaElement).value),
          onKeydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment()
          }
        }),
        h('div', { class: 'dr-row' }, [
          h('button', { class: 'dr-btn', onClick: () => (state.composer = null) }, 'Cancel'),
          h('button', { class: 'dr-btn primary', disabled: !c.text.trim(), onClick: addComment }, 'Add to review')
        ])
      ])
    }

    function renderStatus(): (VNode | null)[] {
      const s = state.status
      if (state.loading && !s) return [h('div', { class: 'dr-muted' }, 'Loading the pull request…')]
      if (state.fetchError) return [note('danger', state.fetchError)]
      if (!s) return []
      const out: (VNode | null)[] = []
      if (s.pr) {
        out.push(
          h('div', { class: 'dr-muted' }, [
            `${s.repo} `,
            h('a', { href: s.pr.url, target: '_blank', rel: 'noreferrer' }, `#${s.pr.number}`),
            ` · ${s.branch ?? 'detached HEAD'} · ${s.pr.headRefOid.slice(0, 7)}`
          ])
        )
      }
      if (s.pr) out.push(h('div', { class: 'dr-muted' }, 'A gray bar on the left of a block means that it is not in the PR diff.'))
      if (s.dryRun) out.push(note('tip', s.pr ? 'Dry run: Submit logs the review in the dev server terminal. Nothing goes to GitHub.' : 'Dry run: Submit logs the review in the dev server terminal. Nothing goes to GitHub. No PR is available, so all lines count as in the diff.'))
      if (s.problem) out.push(note(s.dryRun ? 'warning' : 'danger', `${s.problem.message} Your comments stay here as a local draft.`))
      for (const w of s.warnings) out.push(note('warning', s.dryRun ? w.message : `${w.message} Submit is blocked.`))
      if (branchMismatch.value) out.push(note('warning', branchMismatch.value))
      return out
    }

    function renderComment(c: DraftComment) {
      const outside = !inDiff(c.path, c.startLine ?? c.line, c.line)
      const editing = state.editing?.id === c.id ? state.editing : null
      return h('div', { class: ['dr-item', outside && 'outside'], key: c.id }, [
        h('div', [
          h('button', { class: 'dr-link dr-loc', title: 'Show in the page', onClick: () => goTo(c) }, label(c)),
          outside ? h('span', { class: 'dr-tag', title: 'Goes in the review body as path:line: comment' }, 'outside diff') : null
        ]),
        c.quote ? h('div', { class: 'dr-quote' }, c.quote) : null,
        editing
          ? h('div', [
              h('textarea', {
                value: editing.text,
                onInput: (e: Event) => (editing.text = (e.target as HTMLTextAreaElement).value),
                onKeydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit()
                }
              }),
              h('div', { class: 'dr-row' }, [
                h('button', { class: 'dr-btn', onClick: () => (state.editing = null) }, 'Cancel'),
                h('button', { class: 'dr-btn primary', disabled: !editing.text.trim(), onClick: saveEdit }, 'Save')
              ])
            ])
          : h('div', [
              h('div', { class: 'dr-item-body' }, c.body),
              h('div', { class: 'dr-row' }, [
                h('button', { class: 'dr-btn', onClick: () => (state.editing = { id: c.id, text: c.body }) }, 'Edit'),
                h('button', { class: 'dr-btn danger', onClick: () => remove(c.id) }, 'Delete')
              ])
            ])
      ])
    }

    function renderResult() {
      const r = state.result
      if (!r) return null
      if (!r.ok) return note('danger', r.error?.message ?? 'The submit failed.')
      const outside = r.outsideDiff ? ` ${r.outsideDiff} comment(s) outside the diff went in the review body.` : ''
      if (r.dryRun) {
        return h('div', [
          note('tip', `Dry run: the payload is in the dev server terminal. Nothing went to GitHub.${outside}`),
          h('div', { class: 'dr-pre' }, JSON.stringify(r.payload, null, 2))
        ])
      }
      return note('tip', [h('span', `Review submitted.${outside} `), r.url ? h('a', { href: r.url, target: '_blank', rel: 'noreferrer' }, 'Open on GitHub') : null].filter(Boolean) as VNode[])
    }

    function renderPanel() {
      if (!state.panelOpen) return null
      const byPath = new Map<string, DraftComment[]>()
      for (const c of [...draft.comments].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)) {
        byPath.set(c.path, [...(byPath.get(c.path) ?? []), c])
      }
      const blocked = submitBlockedReason.value
      return h('div', { class: 'dr-panel', role: 'dialog', 'aria-label': 'Pending review' }, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, [
          h('h3', 'Pending review'),
          h('button', { class: 'dr-link', onClick: refresh, disabled: state.loading }, state.loading ? 'Loading…' : 'Reload PR')
        ]),
        ...renderStatus(),
        h('h4', `Comments (${draft.comments.length})`),
        draft.comments.length
          ? h('div', [...byPath.values()].flat().map(renderComment))
          : h('div', { class: 'dr-muted' }, 'Select text in the page, then click "Comment".'),
        h('h4', 'Summary'),
        h('textarea', {
          value: draft.summary,
          placeholder: 'Leave a summary (optional for Comment and Approve)',
          onInput: (e: Event) => (draft.summary = (e.target as HTMLTextAreaElement).value)
        }),
        h(
          'div',
          { class: 'dr-events', role: 'radiogroup' },
          EVENTS.map((ev) =>
            h('label', { title: ev.hint }, [
              h('input', { type: 'radio', name: 'dr-event', value: ev.value, checked: draft.event === ev.value, onChange: () => (draft.event = ev.value) }),
              ev.label
            ])
          )
        ),
        blocked && state.status ? h('div', { class: 'dr-muted' }, blocked) : null,
        h('div', { class: 'dr-row' }, [
          h('button', { class: 'dr-btn danger', disabled: !draft.comments.length && !draft.summary, onClick: discardAll }, 'Discard'),
          h(
            'button',
            { class: 'dr-btn primary', disabled: !!blocked || state.submitting, onClick: submit },
            state.submitting ? 'Submitting…' : state.status?.dryRun ? 'Submit (dry run)' : 'Submit review'
          )
        ]),
        renderResult()
      ])
    }

    return () => {
      if (state.disabled) return null
      return h('div', [
        renderSelectionButton(),
        renderComposer(),
        renderPanel(),
        h(
          'button',
          { class: 'dr-toggle', 'aria-expanded': state.panelOpen, onClick: () => (state.panelOpen = !state.panelOpen) },
          ['Review', h('span', { class: 'dr-count' }, String(draft.comments.length))]
        )
      ])
    }
  }
})

/** Mount the review UI in its own Vue app, outside the theme layout, so it works with any theme. */
export function mountReview(router: Router): void {
  if (document.getElementById(ROOT_ID)) return
  const style = document.createElement('style')
  style.id = `${ROOT_ID}-style`
  style.textContent = css
  document.head.appendChild(style)
  const el = document.createElement('div')
  el.id = ROOT_ID
  document.body.appendChild(el)
  createApp(ReviewApp, { router }).mount(el)
}
