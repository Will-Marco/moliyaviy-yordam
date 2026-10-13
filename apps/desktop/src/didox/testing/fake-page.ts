import { FORBIDDEN_LABEL, type Page, StepError } from '../contract.js'

export type FakeCall =
  | { kind: 'goto'; url: string }
  | { kind: 'read'; snippet: string }
  | { kind: 'waitFor'; snippet: string; what: string; timeoutMs: number }
  | { kind: 'click'; snippet: string; what: string; needsPointer: boolean }
  | { kind: 'type'; snippet: string; text: string; what: string }
  | { kind: 'clear'; snippet: string; what: string }
  | { kind: 'setValue'; snippet: string; text: string; what: string }
  | { kind: 'reload' }
  | { kind: 'selectOption'; open: string; option: string; what: string }
  | { kind: 'pause'; ms: number }
  | { kind: 'screenshot'; label: string }

/** A canned answer for one snippet: a value, or a function of the page (may throw, may change `url`). */
export type Responder = unknown | ((page: FakePage) => unknown)

/**
 * In-memory Page for step tests. Snippets are matched by exact string.
 *
 * waitFor polls like the real one (M8c §9): the answer is asked again and again while a fake clock advances, so a
 * value that only appears after a while — Didox filling the counterparty name, the draft list refreshing — is tested
 * the way it behaves. A value that never turns truthy ends in TIMEOUT, as before.
 * click checks `labels[snippet]` against FORBIDDEN_LABEL like the real guard.
 */
export class FakePage implements Page {
  readonly calls: FakeCall[] = []
  currentUrl = 'about:blank'
  private readonly answers = new Map<string, Responder>()
  /** Visible text of the element each click snippet hits (defaults to `what`). */
  readonly labels = new Map<string, string>()
  /** Side effects of clicking a snippet (e.g. navigation). */
  readonly onClick = new Map<string, (page: FakePage) => void>()
  /** Side effects of picking an option (e.g. the select now shows it). */
  readonly onSelect = new Map<string, (page: FakePage) => void>()
  /** What `clear`/`type` left in each field, for tests that read a value back. */
  readonly values = new Map<string, string>()
  screenshotFails = false
  /** Fake clock, advanced by pause() and by each poll of waitFor. */
  clockMs = 0
  pollIntervalMs = 250

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
    // One recorded call, however many polls: the log shows what was waited for, not how often it was asked.
    this.calls.push({ kind: 'waitFor', snippet, what: opts.what, timeoutMs: opts.timeoutMs })
    const deadline = this.clockMs + opts.timeoutMs
    const ask = () => (this.answers.has(snippet) ? this.answer(snippet) : null)
    for (let value = ask(); ; value = ask()) {
      if (value) return value as T
      if (this.clockMs >= deadline) throw new StepError('TIMEOUT', `${opts.what} ${opts.timeoutMs / 1000} soniyada chiqmadi`)
      this.clockMs += this.pollIntervalMs
    }
  }

  async click(snippet: string, opts: { what: string; needsPointer?: boolean }): Promise<void> {
    this.calls.push({ kind: 'click', snippet, what: opts.what, needsPointer: !!opts.needsPointer })
    const label = this.labels.get(snippet) ?? opts.what
    if (FORBIDDEN_LABEL.test(label)) throw new StepError('FORBIDDEN_ACTION', `Taqiqlangan tugma: ${label}`)
    this.onClick.get(snippet)?.(this)
  }

  async type(snippet: string, text: string, opts: { what: string }): Promise<void> {
    this.calls.push({ kind: 'type', snippet, text, what: opts.what })
    this.values.set(snippet, (this.values.get(snippet) ?? '') + text)
  }

  async clear(snippet: string, opts: { what: string }): Promise<void> {
    this.calls.push({ kind: 'clear', snippet, what: opts.what })
    this.values.set(snippet, '')
  }

  async setValue(snippet: string, text: string, opts: { what: string }): Promise<string | null> {
    this.calls.push({ kind: 'setValue', snippet, text, what: opts.what })
    this.values.set(snippet, text)
    return text
  }

  async reload(): Promise<void> {
    this.calls.push({ kind: 'reload' })
  }

  async selectOption(openSnippet: string, optionSnippet: string, opts: { what: string }): Promise<void> {
    this.calls.push({ kind: 'selectOption', open: openSnippet, option: optionSnippet, what: opts.what })
    const label = this.labels.get(optionSnippet) ?? opts.what
    if (FORBIDDEN_LABEL.test(label)) throw new StepError('FORBIDDEN_ACTION', `Taqiqlangan tugma: ${label}`)
    this.onSelect.get(optionSnippet)?.(this)
  }

  async pause(ms: number): Promise<void> {
    this.calls.push({ kind: 'pause', ms })
    this.clockMs += ms
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
