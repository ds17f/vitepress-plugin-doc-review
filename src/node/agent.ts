import type { AgentFeedback } from '../shared/types.js'

export type AgentSink = (feedback: AgentFeedback) => void

// A global key, not a module variable: the VitePress config can load its own
// copy of this package (for example from the source), and the copy that the
// `doc-review` command loads must see the same sink.
const KEY = Symbol.for('vitepress-plugin-doc-review:agent-sink')
const store = globalThis as typeof globalThis & { [KEY]?: AgentSink }

/** Set by the `doc-review` command. While a sink is set, the dev server is in agent mode. */
export function setAgentSink(sink: AgentSink | null): void {
  if (sink) store[KEY] = sink
  else delete store[KEY]
}

export function agentSink(): AgentSink | undefined {
  return store[KEY]
}
