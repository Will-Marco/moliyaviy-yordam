/**
 * Seams of the Didox driver (M8b). Steps talk only to `Page`; the Electron implementation lives in view.ts,
 * tests use a fake. Nothing here imports electron.
 */

/** One browser tab the app drives like a person would. All waits honour the run's cancel signal. */
export interface Page {
  goto(url: string): Promise<void>
  url(): string
  /** Evaluates a locator snippet (an expression string from locators.ts) in the page and returns its JSON result. */
  read<T>(snippet: string): Promise<T>
  /** Polls `snippet` until it returns a truthy value; throws StepError('TIMEOUT') after `timeoutMs`. */
  waitFor<T>(snippet: string, opts: { timeoutMs: number; what: string }): Promise<T>
  /** Clicks the element `snippet` resolves to. Refuses sign/send buttons (ForbiddenAction). */
  click(snippet: string, opts: { what: string; needsPointer?: boolean }): Promise<void>
  /** Focuses the element and types like a keyboard, with human pauses between characters. */
  type(snippet: string, text: string, opts: { what: string }): Promise<void>
  /** Human-speed pause between actions. */
  pause(ms: number): Promise<void>
  /** Local diagnostics screenshot; returns its file path. */
  screenshot(label: string): Promise<string | null>
}

/** Buttons the app must never press (FR-8.9): sign / send. Page.click checks the element's text against it. */
export const FORBIDDEN_LABEL = /Имзолаш|Юбориш|Подписать|Отправить|Imzolash|Yuborish/i

/** Stable codes: the run journal and the UI key off them. Messages are Uzbek. */
export type StepErrorCode =
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'FORBIDDEN_ACTION'
  | 'EIMZO_NOT_RUNNING'
  | 'KEY_MISSING'
  | 'KEY_EXPIRED'
  | 'KEY_NOT_IN_DIDOX_LIST'
  | 'PASSWORD_MISSING'
  | 'PASSWORD_REJECTED'
  | 'EIMZO_DIALOG_MISSING'
  | 'WRONG_PASSWORD'
  | 'KEYBOARD_LAYOUT'
  | 'ACCESSIBILITY_DENIED'
  | 'AUTOTYPE_INTERRUPTED'
  | 'EIMZO_DIALOG_OPEN'
  | 'PLATFORM_UNSUPPORTED'
  | 'LOGIN_FAILED'
  | 'WRONG_FIRM'
  | 'PAGE_UNEXPECTED'

export class StepError extends Error {
  constructor(
    readonly code: StepErrorCode,
    message: string,
    readonly step?: string,
    readonly screenshot?: string | null,
  ) {
    super(message)
    this.name = 'StepError'
  }
}

/**
 * Result of typing the ERI password into E-IMZO's own window (autotype/).
 * typed — typed once and the dialog closed; no_dialog — no E-IMZO window in time; not_focused — the window or its
 * password field was not focused, nothing typed; rejected — typed once, the dialog stayed, Escape pressed once;
 * layout — keyboard layout is not Latin (macOS keystroke depends on it); no_permission — Accessibility not granted;
 * interrupted — typing started but was not confirmed (focus lost, script failed, killed): treated like a rejection,
 * a person must look before the app types again; dialog_already_open — an E-IMZO window existed before arming,
 * nothing typed (only a window that appears after arming is ever typed into).
 */
export type AutotypeResult =
  | 'typed'
  | 'no_dialog'
  | 'not_focused'
  | 'rejected'
  | 'layout'
  | 'no_permission'
  | 'interrupted'
  | 'dialog_already_open'

/**
 * Arms the typist before "Кириш" is clicked; resolves once it has finished. The password never leaves main.
 * Aborting `signal` before typing has started kills the typist (nothing typed); once typing started it runs to the end.
 */
export type ArmAutotype = (opts: { dialogTimeoutMs: number; signal: AbortSignal }) => Promise<AutotypeResult>

/** Checked before the Didox window opens or "Кириш" is pressed, so a doomed login never leaves a dialog behind. */
export type AutotypePreflightResult = 'ok' | 'layout' | 'no_permission' | 'unsupported' | 'dialog_already_open'
export type AutotypePreflight = () => Promise<AutotypePreflightResult>

/** Codes after which the saved password is marked rejected: it was (maybe) typed and the login did not go through. */
export const REJECTING_CODES: ReadonlySet<StepErrorCode> = new Set(['WRONG_PASSWORD', 'LOGIN_FAILED', 'AUTOTYPE_INTERRUPTED'])

export interface ProgressEvent {
  firmTin: string
  step: string
  status: 'running' | 'done' | 'failed'
  message?: string
}

/** What one firm's login needs; `armAutotype` already has that firm's password bound in. */
export interface LoginContext {
  tin: string
  /** validTo of the E-IMZO key picked for this firm (`yyyy-mm-ddTHH:mm:ss`), to choose among several keys. */
  keyValidTo: string | null
  armAutotype: ArmAutotype
  onProgress?: (e: ProgressEvent) => void
  signal: AbortSignal
}
