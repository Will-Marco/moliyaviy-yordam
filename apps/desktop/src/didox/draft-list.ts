import { type Page, StepError } from './contract.js'
import * as L from './locators.js'
import { tiyinOf } from './money.js'
import { type DraftKey, type ListRow, matchOwnDraft, parseListRow, type RawListRow, type TimeWindow } from './parse.js'

/*
 * Reading Didox's own draft list — shared by the step that has just saved one and by the recovery pass that is
 * looking for a draft an earlier run could not name (M8c §5). Both only ever read: a draft is matched, never made.
 */

/** How far around `savingAt` this app's own draft may be. */
const WINDOW_BEFORE_MS = 2n * 60n * 1000n
const WINDOW_AFTER_MS = 5n * 60n * 1000n

/** What identifies an invoice's draft: the four fields the app itself typed into the form. */
export interface DraftOwner {
  borrowerTin: string
  contractNumber: string
  /** `yyyy-mm-dd`, as the app holds it. */
  contractSignedOn: string
  /** The API's amount string. */
  amount: string
}

export const draftKey = (invoice: DraftOwner): DraftKey => ({
  borrowerTin: invoice.borrowerTin,
  contractNumber: invoice.contractNumber,
  contractDate: dottedDate(invoice.contractSignedOn),
  amountTiyin: tiyinOf(invoice.amount),
})

/** `yyyy-mm-dd` → `dd.mm.yyyy`, the way the list prints a contract date. */
export const dottedDate = (signedOn: string): string =>
  `${signedOn.slice(8, 10)}.${signedOn.slice(5, 7)}.${signedOn.slice(0, 4)}`

/** The minutes around a save in which its own draft can have been created (§5; never "until now"). */
export function savedWindow(savingAt: string): TimeWindow {
  const anchor = BigInt(Date.parse(savingAt))
  return { fromMs: anchor - WINDOW_BEFORE_MS, toMs: anchor + WINDOW_AFTER_MS, unknownTime: 'exclude' }
}

/**
 * Opens the counterparty's drafts and reads them. A full page means the list is only part of the answer, and
 * matching against part of it could name the wrong document — so that is refused instead (LIST_TRUNCATED).
 */
export async function openDraftList(page: Page, borrowerTin: string, timeoutMs: number): Promise<ListRow[]> {
  await page.goto(L.draftListUrl(borrowerTin))
  await page.waitFor(L.listReady.js, { timeoutMs, what: L.listReady.what })
  return readDraftRows(page)
}

/** The rows of the list already on screen. */
export async function readDraftRows(page: Page): Promise<ListRow[]> {
  const raw = await page.read<RawListRow[]>(L.listRows.js)
  if (raw.length >= L.DRAFT_LIST_LIMIT) {
    throw new StepError('LIST_TRUNCATED', `Qoralamalar ro'yxati to'liq emas (${raw.length} qator) — qidiruv ishonchsiz`)
  }
  return raw.flatMap((row) => {
    const parsed = parseListRow(row)
    return parsed ? [parsed] : []
  })
}

export { matchOwnDraft }
