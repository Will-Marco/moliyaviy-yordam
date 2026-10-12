import { FORBIDDEN_LABEL, type Page, StepError } from '../contract.js'

export type FakeCall =
  | { kind: 'goto'; url: string }
  | { kind: 'read'; snippet: string }
  | { kind: 'waitFor'; snippet: string; what: string; timeoutMs: number }
  | { kind: 'click'; snippet: string; what: string; needsPointer: boolean }
  | { kind: 'type'; snippet: string; text: string; what: string }
  | { kind: 'pause'; ms: number }
  | { kind: 'screenshot'; label: string }

/** A canned answer for one snippet: a value, or a function of the page (may throw, may change `url`). */
export type Responder = unknown | ((page: FakePage) => unknown)

/**
 * In-memory Page for step tests. Snippets are matched by exact string. waitFor does not poll: a falsy answer is an
 * immediate TIMEOUT. click checks `labels[snippet]` against FORBIDDEN_LABEL like the real guard.
 */
export class FakePage implements Page {
  readonly calls: FakeCall[] = []
  currentUrl = 'about:blank'
  private readonly answers = new Map<string, Responder>()
  /** Visible text of the element each click snippet hits (defaults to `what`). */
  readonly labels = new Map<string, string>()
  /** Side effects of clicking a snippet (e.g. navigation). */
  readonly onClick = new Map<string, (page: FakePage) => void>()
  screenshotFails = false

  on(snippet: string, answer: Responder): this {
    this.answers.set(snippet, answer)
    return this
  }

  async goto(url: string): Promise<void> {
    this.calls.push({ kind: 'goto', url })
    this.currentUrl = url
  }

  url(): string {
    return this.currentUrl
  }

  async read<T>(snippet: string): Promise<T> {
    this.calls.push({ kind: 'read', snippet })
    return this.answer(snippet) as T
  }

  async waitFor<T>(snippet: string, opts: { timeoutMs: number; what: string }): Promise<T> {
    this.calls.push({ kind: 'waitFor', snippet, what: opts.what, timeoutMs: opts.timeoutMs })
    const value = this.answers.has(snippet) ? this.answer(snippet) : null
    if (!value) throw new StepError('TIMEOUT', `${opts.what} ${opts.timeoutMs / 1000} soniyada chiqmadi`)
    return value as T
  }

  async click(snippet: string, opts: { what: string; needsPointer?: boolean }): Promise<void> {
    this.calls.push({ kind: 'click', snippet, what: opts.what, needsPointer: !!opts.needsPointer })
    const label = this.labels.get(snippet) ?? opts.what
    if (FORBIDDEN_LABEL.test(label)) throw new StepError('FORBIDDEN_ACTION', `Taqiqlangan tugma: ${label}`)
    this.onClick.get(snippet)?.(this)
  }

  async type(snippet: string, text: string, opts: { what: string }): Promise<void> {
    this.calls.push({ kind: 'type', snippet, text, what: opts.what })
  }

  async pause(ms: number): Promise<void> {
    this.calls.push({ kind: 'pause', ms })
  }

  async screenshot(label: string): Promise<string | null> {
    this.calls.push({ kind: 'screenshot', label })
    if (this.screenshotFails) throw new Error('disk full')
    return `/diag/${label}.png`
  }

  /** Calls of one kind, narrowed. */
  of<K extends FakeCall['kind']>(kind: K): Extract<FakeCall, { kind: K }>[] {
    return this.calls.filter((c): c is Extract<FakeCall, { kind: K }> => c.kind === kind)
  }

  private answer(snippet: string): unknown {
    if (!this.answers.has(snippet)) throw new Error(`fake page: no answer for snippet ${snippet.slice(0, 80)}`)
    const a = this.answers.get(snippet)
    return typeof a === 'function' ? (a as (p: FakePage) => unknown)(this) : a
  }
}
