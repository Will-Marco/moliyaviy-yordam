import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/*
 * "Skip this invoice" flags (M8c §2, Sir 2026-10-13). A deterministic failure on one invoice — a draft made by hand
 * in Didox, a counterparty name that will never match — must not stop the firm every month. The accountant marks that
 * invoice skipped for the month; the API never hears about it, because nothing was drafted.
 */

export interface SkipFlag {
  at: string
  note?: string
}

/** `<yyyy-mm>/<contractId>` — one flag per invoice per month. */
const KEY = /^(\d{4}-(?:0[1-9]|1[0-2]))\/(.+)$/
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/

type Skips = Record<string, SkipFlag>

export function createSkipStore({ file, nowMs = Date.now }: { file: string; nowMs?: () => number }) {
  // Serialized like the ERI store: two flags set at once must not drop each other.
  let queue: Promise<unknown> = Promise.resolve()
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  async function load(): Promise<Skips> {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Skips) : {}
    } catch {
      return {} // missing or damaged: nothing is skipped, which is the safe default (the run just does more work)
    }
  }

  const update = (change: (skips: Skips) => void) =>
    serially(async () => {
      const skips = await load()
      change(skips)
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      await writeFile(tmp, JSON.stringify(skips, null, 2), { mode: 0o600 })
      await rename(tmp, file)
    })

  /**
   * One validated key for every operation (review finding 12): an unpadded or out-of-range month used to write a flag
   * that `isSkipped` honoured but `list` could not see, so the run skipped an invoice the page showed as not skipped.
   */
  const key = (month: string, contractId: string) => {
    if (!MONTH.test(month)) throw new Error(`Oy formati kutilganidek emas: ${JSON.stringify(month)}`)
    if (!contractId) throw new Error("Shartnoma ID bo'sh")
    return `${month}/${contractId}`
  }

  return {
    async set(month: string, contractId: string, note?: string): Promise<void> {
      const flag: SkipFlag = { at: new Date(nowMs()).toISOString(), ...(note === undefined ? {} : { note }) }
      await update((skips) => {
        skips[key(month, contractId)] = flag
      })
    },

    async remove(month: string, contractId: string): Promise<void> {
      await update((skips) => {
        delete skips[key(month, contractId)]
      })
    },

    async isSkipped(month: string, contractId: string): Promise<boolean> {
      await queue
      return key(month, contractId) in (await load())
    },

    /** The month's flags by contract id — what the invoices page and the run planner read. */
    async list(month: string): Promise<Record<string, SkipFlag>> {
      await queue
      const skips = await load()
      return Object.fromEntries(
        Object.entries(skips).flatMap(([raw, flag]) => {
          const match = KEY.exec(raw)
          return match && match[1] === month ? [[match[2]!, flag] as const] : []
        }),
      )
    },
  }
}

export type SkipStore = ReturnType<typeof createSkipStore>
