/**
 * ERI key status of one firm, as the desktop app reads it from local E-IMZO.
 * Mirrors the bridge contract in apps/desktop/src/bridge/ipc.ts — change both together.
 */
export type EriKey =
  | { status: 'ok' | 'expired' | 'unknown'; org: string | null; title: string | null; validTo: string | null }
  | { status: 'missing' }

/** Saved ERI password per firm: `rejected` — E-IMZO refused it; `key_changed` — the firm got a new key since. */
export type EriPasswordStatus = 'set' | 'missing' | 'rejected' | 'key_changed'

/** `passwords` comes from the app's own encrypted store, so it is there even when E-IMZO is down. */
export type EriKeyReport = { passwords?: Record<string, EriPasswordStatus> } & (
  | { eimzo: 'ok'; keys: Record<string, EriKey> }
  | { eimzo: 'not_running' | 'error'; message: string }
)

/**
 * One step of a Didox run, as the desktop app reports it (apps/desktop/src/didox/contract.ts ProgressEvent).
 * `runId` and the invoice fields are absent for "Kirishni tekshirish", which is not a journalled run.
 */
export interface DidoxProgress {
  runId?: string
  firmTin: string
  contractId?: string
  /** 1-based position of this invoice within the firm, for "3/7" in the live log. */
  invoiceIndex?: number
  invoiceCount?: number
  step: string
  status: 'running' | 'done' | 'failed'
  message?: string
}

/** Outcome of "Kirishni tekshirish" (apps/desktop/src/didox/run.ts CheckLoginResult); `message` is Uzbek. */
export type DidoxCheckResult = { ok: true } | { ok: false; code: string; message: string; screenshot?: string | null }

/** Outcome of asking for a draft-creation run; `ok: false` means nothing was started. */
export type DidoxStartResult = { ok: true; runId: string } | { ok: false; code: string; message: string }

/** Where one invoice got to: only `marked` is finished, `needs_check` and `error` wait for a person. */
export type DidoxInvoiceState = 'pending' | 'saving' | 'id_found' | 'marked' | 'needs_check' | 'skipped' | 'error'

export interface DidoxRunInvoice {
  contractId: string
  contractNumber: string
  borrowerName: string
  amount: string
  state: DidoxInvoiceState
  didoxId?: string
  code?: string
  message?: string
}

export interface DidoxRunFirm {
  tin: string
  name: string
  status: 'pending' | 'login' | 'running' | 'done' | 'skipped' | 'failed'
  code?: string
  message?: string
  invoices: DidoxRunInvoice[]
}

/** The run journal of the current (or last) draft-creation run — the desktop app keeps it across a reload. */
export interface DidoxRun {
  runId: string
  month: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'done' | 'cancelled' | 'failed'
  failure?: { code: string; message: string }
  firms: DidoxRunFirm[]
}

/** Why an invoice needs a person's attention, as the last run recorded it. */
export interface DidoxNeedsCheck {
  runId: string
  code: string
  message: string
  didoxId?: string
  candidateIds?: string[]
  at: string
}

export interface DidoxInvoiceFlags {
  /** Set while the accountant has told the app to leave this invoice alone this month. */
  skipped?: { at: string }
  needsCheck?: DidoxNeedsCheck
}

export interface DidoxRunSummary {
  runId: string
  month: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'done' | 'cancelled' | 'failed'
  counts: { marked: number; skipped: number; needsCheck: number; error: number; pending: number }
}

/** What the Electron shell exposes as `window.desktop` (apps/desktop/assets/app-preload.cjs). */
export interface DesktopBridge {
  platform: string
  eri: {
    listKeys(tins: string[]): Promise<EriKeyReport>
    /** Encrypted by the OS and kept on this computer only; never readable back. */
    setPassword(tin: string, password: string): Promise<void>
    removePassword(tin: string): Promise<void>
  }
  /** Absent in desktop builds older than M8b. The app logs in to Didox in its own window; it never signs or sends. */
  didox?: {
    checkLogin(tin: string): Promise<DidoxCheckResult>
    /** Absent in desktop builds older than M8c. */
    createDrafts(opts: { month: string; lenderIds: string[] | 'all' }): Promise<DidoxStartResult>
    /** Null when this computer has never run one. */
    status(): Promise<DidoxRun | null>
    cancel(): Promise<void>
    /** Returns the unsubscribe function. */
    onProgress(callback: (progress: DidoxProgress) => void): () => void
    /** Keyed by contractId; invoices without a flag are absent. */
    invoiceFlags(month: string): Promise<Record<string, DidoxInvoiceFlags>>
    skipInvoice(opts: { month: string; contractId: string; skip: boolean }): Promise<void>
    /** "Hal qilindi": drops the needs-check flag. Touches nothing in the API. */
    resolveNeedsCheck(opts: { month: string; contractId: string }): Promise<void>
    listRuns(opts?: { month?: string; limit?: number }): Promise<DidoxRunSummary[]>
    getRun(runId: string): Promise<DidoxRun | null>
    openDiagnostics(): Promise<void>
  }
  backups: {
    /** `last` — when the newest daily backup was written (ISO), or null. */
    status(): Promise<{ last: string | null }>
    openFolder(): Promise<void>
  }
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

/** The desktop bridge, or null in a plain browser. */
export function useDesktop(): DesktopBridge | null {
  return window.desktop ?? null
}
