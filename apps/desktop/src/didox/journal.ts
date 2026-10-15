import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { FlagWriteResult, MarkDraftBody, MarkDraftResult, NeedsCheckFlag } from '../api/client.js'

/*
 * The run journal (M8c §2, FR-8.7). Main is its only writer. Every state change is written through to disk before the
 * app acts on Didox, so the answer to "did we already save this?" survives a crash, a kill or a power cut.
 *
 * The invariant that matters: a draft may exist in Didox while the app is not running. Therefore `saving` is written
 * *before* the save button is pressed, and the found ID is written *before* the API is told about it. Nothing is ever
 * created or re-marked automatically — an interrupted invoice waits for a person (`needs_check`).
 *
 * M13: the journal stays on this computer (FR-8.7), but a `needs_check` is also what every accountant must see, so
 * each one is queued for the shared server (`flagSync`) and sent by `pushFlags` — the same outbox shape as
 * `flushIdFound`, so a server that is down when the invoice is flagged only delays the flag, never loses it.
 */

export type RunStatus = 'running' | 'done' | 'cancelled' | 'failed'
export type FirmStatus = 'pending' | 'login' | 'running' | 'done' | 'skipped' | 'failed'
export type InvoiceState = 'pending' | 'saving' | 'id_found' | 'marked' | 'needs_check' | 'skipped' | 'error'

export interface InvoiceEntry {
  contractId: string
  contractNumber: string
  /** `yyyy-mm-dd` — part of the key that identifies this invoice's draft in Didox's list. */
  contractSignedOn: string
  borrowerTin: string
  borrowerName: string
  lineName: string
  /** The API's amount string, written into Didox and sent back as `expectedAmount`. */
  amount: string
  state: InvoiceState
  /** Written before "Сақлаб қолиш" is pressed; the anchor of the recovery window (§5). */
  savingAt?: string
  didoxId?: string
  /** SIMILAR_DRAFT_EXISTS / SAVED_ID_AMBIGUOUS: what a person has to choose between. */
  candidateIds?: string[]
  code?: string
  message?: string
  /** "Hal qilindi": the accountant has dealt with this one, so it no longer asks for attention (§7). */
  resolved?: boolean
  /**
   * Where the server's copy of this invoice's needs-check stands (M13): `pending` — to be sent; `sent` — the server has
   * it; `clear` — the invoice is settled here and the server's flag is to be resolved. Absent: nothing to do (or a run
   * written before M13, whose flags the data move carried to the server).
   */
  flagSync?: 'pending' | 'sent' | 'clear'
  screenshot?: string | null
  steps?: { step: string; status: 'done' | 'failed'; at: string }[]
}

export interface FirmEntry {
  tin: string
  name: string
  status: FirmStatus
  code?: string
  message?: string
  screenshot?: string | null
  invoices: InvoiceEntry[]
}

export type RunTrigger = 'manual' | 'scheduled'

export interface RunJournal {
  runId: string
  month: string
  /** Who started it: the accountant, or the monthly schedule (M8d). */
  trigger: RunTrigger
  startedAt: string
  finishedAt?: string
  status: RunStatus
  failure?: { code: string; message: string }
  firms: FirmEntry[]
}

export interface InvoicePlan {
  contractId: string
  contractNumber: string
  contractSignedOn: string
  borrowerTin: string
  borrowerName: string
  lineName: string
  amount: string
}

export interface FirmPlan {
  tin: string
  name: string
  invoices: InvoicePlan[]
}

export interface RunCounts {
  marked: number
  skipped: number
  needsCheck: number
  error: number
  /** Not reached: still pending, saving or waiting to be marked. */
  pending: number
}

export interface RunSummary {
  runId: string
  month: string
  startedAt: string
  finishedAt?: string
  status: RunStatus
  /** Why the run stopped, when it stopped on its own; the schedule reads the code (M8d). */
  failure?: { code: string; message: string }
  counts: RunCounts
}

export interface FlushResult {
  marked: number
  needsCheck: number
  /** Still `id_found`: the API could not be reached, so the next run tries again. */
  left: number
  unauthorized: boolean
}

/** Where recovery looks: a needs_check invoice whose save started but whose draft was never identified (§3.4). */
export interface NeedsCheckEntry {
  runId: string
  firmTin: string
  invoice: InvoiceEntry
}

export interface PushResult {
  sent: number
  cleared: number
  /** Still queued: the server did not answer, so the next push tries again. */
  left: number
  unauthorized: boolean
}

/** What the journal needs of the API client. */
type MarkDraft = (month: string, contractId: string, mark: MarkDraftBody) => Promise<MarkDraftResult>

/** The server's Didox flags, as far as the journal writes them (apps/desktop/src/api/client.ts). */
export interface FlagSink {
  recordNeedsCheck(month: string, contractId: string, flag: NeedsCheckFlag): Promise<FlagWriteResult>
  resolveNeedsCheck(month: string, contractId: string): Promise<FlagWriteResult>
}

const MAX_RUNS = 50
/** Enough to show the live log of one invoice; the journal is a record, not a trace. */
const MAX_STEPS = 40
const RUN_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f]{4}$/

/** Only these moves are possible. Anything else is a bug that could lose a draft, so it throws. */
const INVOICE_TRANSITIONS: Record<InvoiceState, InvoiceState[]> = {
  pending: ['saving', 'skipped', 'needs_check', 'error'],
  saving: ['id_found', 'needs_check', 'error'],
  // The ID is on disk: it is either marked in the API or handed to a person.
  id_found: ['marked', 'needs_check', 'error'],
  // Recovery may identify the draft later (§3.4, §5) or only refresh the reason.
  needs_check: ['id_found', 'needs_check'],
  marked: [],
  skipped: [],
  error: [],
}

const FIRM_TRANSITIONS: Record<FirmStatus, FirmStatus[]> = {
  pending: ['login', 'running', 'skipped', 'failed'],
  login: ['running', 'skipped', 'failed'],
  running: ['done', 'skipped', 'failed'],
  done: [],
  skipped: [],
  failed: [],
}

export interface InvoicePatch {
  state: InvoiceState
  /** The run reads the amount again after login; the record must then say what was actually written. */
  amount?: string
  savingAt?: string
  didoxId?: string
  candidateIds?: string[]
  code?: string
  message?: string
  screenshot?: string | null
}

export interface FirmPatch {
  status: FirmStatus
  code?: string
  message?: string
  screenshot?: string | null
}

export function createJournal({
  dir,
  nowMs = Date.now,
  randomHex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0'),
}: {
  dir: string
  nowMs?: () => number
  randomHex?: () => string
}) {
  // One writer, one queue: two writes never read the same file and drop each other's change.
  let queue: Promise<unknown> = Promise.resolve()
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  const iso = () => new Date(nowMs()).toISOString()
  const file = (runId: string) => join(dir, `${runId}.json`)

  /**
   * Atomic *and* durable: the temp file's data is flushed before the rename, and the directory entry after it. The
   * whole INTERRUPTED_SAVE recovery depends on `saving` being readable after a power cut, not just after a crash.
   */
  async function write(journal: RunJournal): Promise<void> {
    await mkdir(dir, { recursive: true })
    const tmp = `${file(journal.runId)}.tmp`
    const handle = await open(tmp, 'w', 0o600)
    try {
      await handle.writeFile(JSON.stringify(journal, null, 2))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, file(journal.runId))
    const folder = await open(dir, 'r')
    try {
      await folder.sync()
    } catch {
      // Some filesystems refuse to fsync a directory; the rename itself is still atomic.
    } finally {
      await folder.close()
    }
  }

  async function load(runId: string): Promise<RunJournal | null> {
    if (!RUN_ID.test(runId)) return null
    try {
      const parsed: unknown = JSON.parse(await readFile(file(runId), 'utf8'))
      return isJournal(parsed) ? parsed : null
    } catch {
      return null // missing or damaged: a lost record must not stop the app
    }
  }

  /** Run ids are time-ordered by name, so the directory listing is the history. */
  const runIds = async (): Promise<string[]> => {
    try {
      return (await readdir(dir))
        .filter((name) => name.endsWith('.json') && RUN_ID.test(name.slice(0, -'.json'.length)))
        .map((name) => name.slice(0, -'.json'.length))
        .sort()
    } catch {
      return []
    }
  }

  const loadAll = async (): Promise<RunJournal[]> =>
    (await Promise.all((await runIds()).map(load))).flatMap((j) => (j ? [j] : []))

  /**
   * Reads, changes and writes one run under the queue; the changed journal is returned. Every change passes through
   * here, so this is also where an invoice entering or leaving `needs_check` is queued for the server.
   */
  const edit = (runId: string, change: (journal: RunJournal) => void): Promise<RunJournal> =>
    serially(async () => {
      const journal = await load(runId)
      if (!journal) throw new Error(`Run yozuvi topilmadi: ${runId}`)
      const before = structuredClone(journal)
      change(journal)
      queueFlagSync(before, journal)
      await write(journal)
      return journal
    })

  /** Sets one entry's `flagSync`, but only if the entry is still what was sent — a newer reason stays queued. */
  const settleSync = (runId: string, tin: string, sent: InvoiceEntry, next: InvoiceEntry['flagSync']) =>
    edit(runId, (j) => {
      const invoice = findInvoice(j, tin, sent.contractId)
      if (invoice.flagSync !== sent.flagSync || flagChanged(invoice, sent)) return
      if (next === undefined) delete invoice.flagSync
      else invoice.flagSync = next
    })

  /** Pushes run one after another; each is a full pass over what is on disk when it starts. */
  let pushes: Promise<unknown> = Promise.resolve()

  async function mark(markDraft: MarkDraft, journal: RunJournal, firm: FirmEntry, invoice: InvoiceEntry) {
    if (!invoice.didoxId) {
      // Nothing to send; the draft (if any) has to be found by a person.
      await edit(journal.runId, (j) =>
        patchInvoice(j, firm.tin, invoice.contractId, {
          state: 'needs_check',
          code: 'SAVED_ID_UNKNOWN',
          message: "Didox ID yozilmagan — Didox Қоралама'sini tekshiring",
        }),
      )
      return 'needs_check' as const
    }
    const result = await markDraft(journal.month, invoice.contractId, {
      didoxDocumentId: invoice.didoxId,
      expectedAmount: invoice.amount,
    })
    if (result.ok) {
      await edit(journal.runId, (j) => patchInvoice(j, firm.tin, invoice.contractId, { state: 'marked' }))
      return 'marked' as const
    }
    if (result.status === 401) return 'unauthorized' as const
    // No answer or a server fault says nothing about this invoice: keep the ID and try again next time.
    if (result.status === 0 || result.status >= 500) return 'left' as const
    await edit(journal.runId, (j) =>
      patchInvoice(j, firm.tin, invoice.contractId, {
        state: 'needs_check',
        code: rejectionCode(result),
        message: result.message,
      }),
    )
    return 'needs_check' as const
  }

  return {
    /** Creates the run's file before any firm is touched: an unexplained crash still leaves a record. */
    async start(plan: { month: string; trigger: RunTrigger; firms: FirmPlan[] }) {
      const journal = await serially(async () => {
        const startedAt = iso()
        const runId = `${startedAt.replace(/:/g, '-')}-${randomHex()}`
        if (await exists(file(runId))) throw new Error(`Run yozuvi allaqachon bor: ${runId}`)
        const created: RunJournal = {
          runId,
          month: plan.month,
          trigger: plan.trigger,
          startedAt,
          status: 'running',
          firms: plan.firms.map((firm) => ({
            tin: firm.tin,
            name: firm.name,
            status: 'pending',
            invoices: firm.invoices.map((invoice) => ({ ...invoice, state: 'pending' })),
          })),
        }
        await write(created)
        return created
      })

      return {
        runId: journal.runId,
        /** The journal as last written — the live state the UI and the runner read. */
        snapshot: (): RunJournal => journal,
        setFirm: (tin: string, patch: FirmPatch) =>
          edit(journal.runId, (j) => replace(journal, patchFirm(j, tin, patch))),
        setInvoice: (tin: string, contractId: string, patch: InvoicePatch) =>
          edit(journal.runId, (j) => replace(journal, patchInvoice(j, tin, contractId, patch))),
        /**
         * Sends a found ID to the API and records what came back — step 13 and the recovery path share this with
         * `flushIdFound`, so an answer never means two different things depending on who asked.
         */
        markInvoice: (markDraft: MarkDraft, tin: string, contractId: string) =>
          mark(markDraft, journal, findFirm(journal, tin), findInvoice(journal, tin, contractId)),
        addStep: (tin: string, contractId: string, step: { step: string; status: 'done' | 'failed' }) =>
          edit(journal.runId, (j) => {
            const invoice = findInvoice(j, tin, contractId)
            invoice.steps = [...(invoice.steps ?? []), { ...step, at: iso() }].slice(-MAX_STEPS)
            replace(journal, j)
          }),
        finish: (status: Exclude<RunStatus, 'running'>, failure?: { code: string; message: string }) =>
          edit(journal.runId, (j) => {
            j.status = status
            j.finishedAt = iso()
            if (failure) j.failure = failure
            replace(journal, j)
          }),
      }
    },

    read: load,

    async list({ month, limit = 5 }: { month?: string; limit?: number } = {}): Promise<RunSummary[]> {
      const runs = (await loadAll()).filter((j) => !month || j.month === month).reverse()
      return runs.slice(0, limit).map((j) => ({
        runId: j.runId,
        month: j.month,
        startedAt: j.startedAt,
        ...(j.finishedAt === undefined ? {} : { finishedAt: j.finishedAt }),
        status: j.status,
        // The schedule reads this to tell "the app never got going" from "the app ran and found trouble" (M8d).
        ...(j.failure === undefined ? {} : { failure: j.failure }),
        counts: counts(j),
      }))
    },

    /**
     * Keeps the newest MAX_RUNS — plus every run that still holds an unresolved invoice (§2). Rotation walks the file
     * names, not the parsed runs: a damaged file carries no information to protect, so it is dropped with the rest
     * instead of living for ever and eating into the retention.
     */
    async rotate(): Promise<void> {
      const ids = await runIds()
      const keep = new Set(ids.slice(-MAX_RUNS))
      for (const runId of ids) {
        if (keep.has(runId)) continue
        const journal = await load(runId)
        if (journal && invoices(journal).some((i) => i.state === 'needs_check' || i.state === 'id_found' || i.flagSync)) continue
        await serially(() => rm(file(runId), { force: true }))
      }
    },

    /**
     * Called when the app opens: a run still marked `running` means the app died mid-flight. Its interrupted save
     * becomes `needs_check` (Didox may hold a draft), its untouched invoices are skipped, and the IDs it had already
     * found are left for flushIdFound. Returns the runs it closed.
     */
    async recoverStaleRuns(): Promise<string[]> {
      const stale = (await loadAll()).filter((j) => j.status === 'running')
      for (const journal of stale) {
        await edit(journal.runId, (j) => {
          j.status = 'failed'
          j.failure = { code: 'APP_CLOSED', message: 'Ilova ish tugashidan oldin yopildi' }
          j.finishedAt = iso()
          for (const firm of j.firms) {
            if (firm.status === 'pending') firm.status = 'skipped'
            else if (firm.status === 'login' || firm.status === 'running') {
              firm.status = 'failed'
              firm.code ??= 'APP_CLOSED'
            }
            for (const invoice of firm.invoices) {
              if (invoice.state === 'saving') {
                invoice.state = 'needs_check'
                invoice.code = 'INTERRUPTED_SAVE'
                invoice.message = "Saqlash tugamadi — Didox Қоралама'sini tekshiring"
              } else if (invoice.state === 'pending') {
                invoice.state = 'skipped'
                invoice.code = 'APP_CLOSED'
                invoice.message = 'Ilova yopildi'
              }
            }
          }
        })
      }
      return stale.map((j) => j.runId)
    },

    /**
     * Sends every ID that is on disk but not yet in the API (§2). Runs when the app opens and at the start of each
     * run, so "created in Didox, missing in the app" is never left silently. A run still in flight is skipped: its
     * own step 13 owns those invoices.
     */
    async flushIdFound(api: { markDraft: MarkDraft }): Promise<FlushResult> {
      const result: FlushResult = { marked: 0, needsCheck: 0, left: 0, unauthorized: false }
      for (const journal of (await loadAll()).filter((j) => j.status !== 'running')) {
        for (const firm of journal.firms) {
          for (const invoice of firm.invoices.filter((i) => i.state === 'id_found')) {
            if (result.unauthorized) {
              result.left++
              continue
            }
            const outcome = await mark(api.markDraft, journal, firm, invoice)
            if (outcome === 'unauthorized') {
              result.unauthorized = true
              result.left++
            } else if (outcome === 'marked') result.marked++
            else if (outcome === 'needs_check') result.needsCheck++
            else result.left++
          }
        }
      }
      return result
    },

    /**
     * The draft this run found for an invoice an earlier run could not identify (§5). The id is written down
     * before anything is sent: `flushIdFound` is what tells the API about it, in one place for every path.
     */
    async attachFoundId(runId: string, tin: string, contractId: string, didoxId: string): Promise<void> {
      await edit(runId, (j) => patchInvoice(j, tin, contractId, { state: 'id_found', didoxId }))
    },

    /** Same invoice, still unidentified: only the reason is refreshed, so the accountant reads today's story. */
    async refreshNeedsCheck(runId: string, tin: string, contractId: string, message: string): Promise<void> {
      await edit(runId, (j) => patchInvoice(j, tin, contractId, { state: 'needs_check', message }))
    },

    /** "Hal qilindi" — the accountant has dealt with it; the record stays, the flag goes. */
    async resolveNeedsCheck(runId: string, tin: string, contractId: string): Promise<void> {
      await edit(runId, (j) => {
        findInvoice(j, tin, contractId).resolved = true
      })
    },

    /**
     * Sends every queued needs-check to the server, and resolves the server's flag for every invoice that has since
     * been settled here (M13). Runs when the app opens, before a run plans and after it ends; a run still in flight
     * is included, because a flag is only ever news. One push at a time, so nothing is sent twice in parallel; a push
     * asked for while another is going runs after it, over what is queued by then.
     */
    pushFlags(api: FlagSink): Promise<PushResult> {
      const pass = async (): Promise<PushResult> => {
        const result: PushResult = { sent: 0, cleared: 0, left: 0, unauthorized: false }
        for (const journal of await loadAll()) {
          for (const firm of journal.firms) {
            for (const invoice of firm.invoices.filter((i) => i.flagSync === 'pending' || i.flagSync === 'clear')) {
              if (result.unauthorized) {
                result.left++
                continue
              }
              const outcome = pushOutcome(await sendFlag(api, journal, invoice), invoice.flagSync === 'clear')
              if (outcome === 'unauthorized') {
                result.unauthorized = true
                result.left++
              } else if (outcome === 'retry') {
                result.left++
              } else {
                // Done, or refused for good (the contract was deleted, a 400 that will never pass): stop sending it.
                await settleSync(journal.runId, firm.tin, invoice, outcome === 'done' && invoice.flagSync === 'pending' ? 'sent' : undefined)
                if (outcome === 'done' && invoice.flagSync === 'clear') result.cleared++
                else if (outcome === 'done') result.sent++
              }
            }
          }
        }
        return result
      }
      const next = pushes.then(pass, pass)
      pushes = next.catch(() => undefined)
      return next
    },

    /** Invoices of `month` whose save started but whose draft was never identified — §5 may still find it. */
    async findNeedsCheck(month: string): Promise<NeedsCheckEntry[]> {
      const runs = (await loadAll()).filter((j) => j.month === month && j.status !== 'running')
      return runs.flatMap((j) =>
        j.firms.flatMap((firm) =>
          firm.invoices
            .filter((i) => i.state === 'needs_check' && !i.resolved && !!i.savingAt && !i.didoxId)
            .map((invoice) => ({ runId: j.runId, firmTin: firm.tin, invoice })),
        ),
      )
    },
  }
}

export type Journal = ReturnType<typeof createJournal>
export type RunHandle = Awaited<ReturnType<Journal['start']>>

/** One queued entry to the server: its needs-check, or the resolve of a flag it no longer deserves. */
function sendFlag(api: FlagSink, journal: RunJournal, invoice: InvoiceEntry): Promise<FlagWriteResult> {
  if (invoice.flagSync === 'clear') return api.resolveNeedsCheck(journal.month, invoice.contractId)
  return api.recordNeedsCheck(journal.month, invoice.contractId, {
    runId: journal.runId,
    code: invoice.code ?? 'UNEXPECTED',
    message: invoice.message ?? '',
    ...(invoice.didoxId === undefined ? {} : { didoxId: invoice.didoxId }),
    ...(invoice.candidateIds === undefined ? {} : { candidateIds: invoice.candidateIds }),
  })
}

/**
 * How a flag write ended: `done`, try again later, stop everything, or never again. 401 and 403 say the robot's key
 * is not accepted — nothing about the flag — so they stop the push and keep everything queued.
 */
function pushOutcome(answer: FlagWriteResult, isResolve: boolean): 'done' | 'retry' | 'unauthorized' | 'refused' {
  if (answer.ok) return 'done'
  if (answer.status === 401 || answer.status === 403) return 'unauthorized'
  if (answer.status === 0 || answer.status >= 500 || answer.status === 408 || answer.status === 429) return 'retry'
  // A resolve the server has nothing for has reached its goal: there is no unresolved flag.
  return isResolve && answer.status === 404 ? 'done' : 'refused'
}

const isOpenNeedsCheck = (invoice: InvoiceEntry | undefined) => !!invoice && invoice.state === 'needs_check' && !invoice.resolved

/** What the server shows of a needs-check; a change in any of these is news for the other accountants. */
const flagChanged = (a: InvoiceEntry, b: InvoiceEntry) =>
  a.state !== b.state ||
  a.code !== b.code ||
  a.message !== b.message ||
  a.didoxId !== b.didoxId ||
  JSON.stringify(a.candidateIds ?? []) !== JSON.stringify(b.candidateIds ?? [])

/**
 * Queues the server side of what just changed: a new or changed needs-check is to be sent; an invoice that left it
 * — or was marked in any run — is to have the server's flag resolved. A local "resolved" mirrors a resolution that
 * already happened on the server, so nothing is queued for it.
 */
function queueFlagSync(before: RunJournal, after: RunJournal): void {
  for (const firm of after.firms) {
    for (const invoice of firm.invoices) {
      const previous = before.firms.find((f) => f.tin === firm.tin)?.invoices.find((i) => i.contractId === invoice.contractId)
      const was = isOpenNeedsCheck(previous)
      if (isOpenNeedsCheck(invoice)) {
        if (!was || flagChanged(previous!, invoice)) invoice.flagSync = 'pending'
      } else if (invoice.resolved && was) {
        delete invoice.flagSync
      } else if (was || (invoice.state === 'marked' && previous?.state !== 'marked')) {
        // Marked in any run: a needs-check another computer left on this invoice is settled too (a resolve the
        // server has no flag for is answered 404 and dropped).
        invoice.flagSync = 'clear'
      }
    }
  }
}

/** 409s carry the API's own code (AMOUNT_CHANGED, DRAFT_CHANGED, or the warning that needs a person). */
function rejectionCode(result: Extract<MarkDraftResult, { ok: false }>): string {
  if (result.code === 'CONFIRMATION_REQUIRED') return result.warnings?.[0]?.code ?? 'CONFIRMATION_REQUIRED'
  return result.status === 409 && result.code ? result.code : 'API_REJECTED'
}

function patchFirm(journal: RunJournal, tin: string, patch: FirmPatch): RunJournal {
  const firm = findFirm(journal, tin)
  assertMove('Firma', firm.status, patch.status, FIRM_TRANSITIONS[firm.status])
  Object.assign(firm, pruned(patch))
  return journal
}

function patchInvoice(journal: RunJournal, tin: string, contractId: string, patch: InvoicePatch): RunJournal {
  const invoice = findInvoice(journal, tin, contractId)
  assertMove('Faktura', invoice.state, patch.state, INVOICE_TRANSITIONS[invoice.state])
  const { state, ...rest } = patch
  Object.assign(invoice, { state }, pruned(rest))
  return journal
}

function assertMove(what: string, from: string, to: string, allowed: readonly string[]): void {
  if (!allowed.includes(to)) throw new Error(`${what} holati ${from} dan ${to} ga o'tmaydi`)
}

/** `undefined` in a patch means "leave as it is", so it must not overwrite a recorded value. */
const pruned = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>

function findFirm(journal: RunJournal, tin: string): FirmEntry {
  const firm = journal.firms.find((f) => f.tin === tin)
  if (!firm) throw new Error(`Run yozuvida firma yo'q: ${tin}`)
  return firm
}

function findInvoice(journal: RunJournal, tin: string, contractId: string): InvoiceEntry {
  const invoice = findFirm(journal, tin).invoices.find((i) => i.contractId === contractId)
  if (!invoice) throw new Error(`Run yozuvida faktura yo'q: ${contractId}`)
  return invoice
}

/** Keeps the handle's in-memory snapshot the same object as what was just written. */
function replace(target: RunJournal, source: RunJournal): void {
  Object.assign(target, source)
}

const invoices = (journal: RunJournal): InvoiceEntry[] => journal.firms.flatMap((f) => f.invoices)

function counts(journal: RunJournal): RunCounts {
  const all = invoices(journal)
  const of = (...states: InvoiceState[]) => all.filter((i) => states.includes(i.state)).length
  return {
    marked: of('marked'),
    skipped: of('skipped'),
    needsCheck: of('needs_check'),
    error: of('error'),
    pending: of('pending', 'saving', 'id_found'),
  }
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

function isJournal(value: unknown): value is RunJournal {
  const j = value as RunJournal | null
  return !!j && typeof j === 'object' && typeof j.runId === 'string' && typeof j.month === 'string' && Array.isArray(j.firms)
}
