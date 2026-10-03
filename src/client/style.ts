/** Styles of the review UI. They use VitePress CSS variables, so they follow the light and dark themes. */
export const css = /* css */ `
.dr-not-commentable {
  box-shadow: -3px 0 0 0 var(--vp-c-text-3);
}
.dr-has-comment {
  background-color: var(--vp-c-yellow-soft);
  box-shadow: -3px 0 0 0 var(--vp-c-yellow-1);
  border-radius: 2px;
}
.dr-flash {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
  transition: outline-color 0.6s;
}
#doc-review-root {
  font-family: var(--vp-font-family-base);
  font-size: 14px;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}
#doc-review-root button { font: inherit; cursor: pointer; }
#doc-review-root button:disabled { cursor: not-allowed; opacity: 0.55; }
#doc-review-root textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 72px;
  padding: 6px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  resize: vertical;
}
#doc-review-root textarea:focus { outline: none; border-color: var(--vp-c-brand-1); }
.dr-btn {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 3px 10px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.dr-btn:hover:not(:disabled) { border-color: var(--vp-c-brand-1); }
.dr-btn.primary {
  background: var(--vp-c-brand-3);
  border-color: var(--vp-c-brand-3);
  color: var(--vp-c-white);
}
.dr-btn.primary:hover:not(:disabled) { background: var(--vp-c-brand-2); }
.dr-btn.danger { color: var(--vp-c-danger-1); }
.dr-link { background: none; border: 0; padding: 0; color: var(--vp-c-brand-1); text-align: left; }
.dr-link:hover { text-decoration: underline; }
.dr-float {
  position: absolute;
  z-index: 200;
  box-shadow: var(--vp-shadow-3);
}
.dr-comment-btn {
  border-radius: 6px;
  border: 1px solid var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  padding: 2px 10px;
  font-weight: 500;
}
.dr-comment-btn.muted { border-color: var(--vp-c-divider); color: var(--vp-c-text-2); }
.dr-composer {
  width: min(420px, calc(100vw - 32px));
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
}
.dr-loc { font-family: var(--vp-font-family-mono); font-size: 12px; color: var(--vp-c-text-2); }
.dr-quote {
  margin: 6px 0;
  padding: 2px 8px;
  border-left: 3px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  font-size: 13px;
  white-space: pre-wrap;
  max-height: 4.5em;
  overflow: hidden;
}
.dr-note {
  margin: 8px 0;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  background: var(--vp-c-default-soft);
}
.dr-note.warning { background: var(--vp-c-warning-soft); }
.dr-note.danger { background: var(--vp-c-danger-soft); }
.dr-note.tip { background: var(--vp-c-tip-soft); }
.dr-row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 8px; }
.dr-toggle {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 210;
  border-radius: 20px;
  padding: 8px 16px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  box-shadow: var(--vp-shadow-3);
  font-weight: 500;
}
.dr-toggle .dr-count {
  display: inline-block;
  min-width: 20px;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.dr-panel {
  position: fixed;
  right: 20px;
  bottom: 70px;
  z-index: 210;
  width: min(420px, calc(100vw - 40px));
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-4);
}
.dr-panel h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.dr-panel h4 { margin: 14px 0 6px; font-size: 13px; font-weight: 600; color: var(--vp-c-text-2); }
.dr-item {
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
}
.dr-item.outside { border-style: dashed; }
.dr-item-body { white-space: pre-wrap; margin-top: 4px; }
.dr-tag { font-size: 11px; color: var(--vp-c-warning-1); margin-left: 6px; }
.dr-events { display: flex; flex-direction: column; gap: 2px; margin: 8px 0; }
.dr-events label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
.dr-pre {
  max-height: 240px;
  overflow: auto;
  padding: 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-alt);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  white-space: pre;
}
.dr-muted { color: var(--vp-c-text-2); font-size: 13px; }
`
