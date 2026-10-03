import { execFile } from 'node:child_process'

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
  /** True when the program is not installed. */
  missing: boolean
}

/**
 * Run a program with an argument array. No shell is used, so the arguments are
 * never parsed as shell syntax. `input` goes to stdin.
 */
export function run(cmd: string, args: string[], opts: { cwd: string; input?: string } = { cwd: process.cwd() }): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { cwd: opts.cwd, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: string | number }) | null
        resolve({
          code: e ? (typeof e.code === 'number' ? e.code : 1) : 0,
          stdout: String(stdout),
          stderr: String(stderr),
          missing: e?.code === 'ENOENT'
        })
      }
    )
    if (opts.input !== undefined) child.stdin?.end(opts.input)
    else child.stdin?.end()
  })
}
