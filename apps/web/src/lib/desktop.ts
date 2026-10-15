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

/**
 * Why an invoice needs a person's attention, as the robot recorded it on the server (`GET /api/didox-flags`,
 * apps/api/src/didox-flags/didox-flag.ts — change both together).
 */
export interface DidoxNeedsCheck {
  /** Absent for a flag carried over by the data move without its run. */
  runId?: string
  code: string
  message: string
  didoxId?: string
  candidateIds?: string[]
  at: string
  /** The desktop install that recorded it — only that computer can recover an interrupted save (M13 §4.2). */
  createdByInstall?: string
}

export interface DidoxInvoiceFlags {
  /** Set while an accountant has told the robot to leave this invoice alone this month. */
  skipped?: { at: string }
  needsCheck?: DidoxNeedsCheck
}

/** Which computer this desktop app is on the server (`label` is what its flags carry as `createdByInstall`). */
export interface DesktopInstall {
  id: string
  name: string
  label: string
}

export interface DidoxRunSummary {
  runId: string
  month: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'done' | 'cancelled' | 'failed'
  counts: { marked: number; skipped: number; needsCheck: number; error: number; pending: number }
}

/**
 * What the Electron shell exposes as `window.desktop` (apps/desktop/assets/app-preload.cjs). Since M13 the page comes
 * from the shared server, so the bridge carries no secret: the ERI password is typed in the app's own window, and
 * every Didox login asked for here is confirmed in a native dialog first (`code: 'CANCELLED'` when it is not).
 */
export interface DesktopBridge {
  platform: string
  /** Absent in desktop builds older than M13. */
  install?(): Promise<DesktopInstall>
  eri: {
    listKeys(tins: string[]): Promise<EriKeyReport>
    /**
     * Opens the app's own password window for the firm; resolves once it is closed. The password is typed there,
     * encrypted by the OS and kept on this computer only — the page never sees it.
     */
    openPasswordWindow(tin: string): Promise<{ saved: boolean }>
    /**
     * Asks the desktop app to remove the saved password; it confirms in its own dialog first. Nothing (`undefined`)
     * when removed; `code: 'CANCELLED'` when the person said no there.
     */
    removePassword(tin: string): Promise<void | { ok: false; code: string; message: string }>
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
    /** This computer's own run history (FR-8.7); the flags themselves are on the server. */
    listRuns(opts?: { month?: string; limit?: number }): Promise<DidoxRunSummary[]>
    getRun(runId: string): Promise<DidoxRun | null>
    openDiagnostics(): Promise<void>
  }
  /** Desktop builds before M13 only (local database); the shared server is backed up on the server. */
  backups?: {
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
