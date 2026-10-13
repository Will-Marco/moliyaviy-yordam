import { parseDidoxMoney } from './money.js'

/*
 * Reading Didox's own draft list (M8c §5). Pure functions: the locators hand over raw cell text, these decide what it
 * means. Two callers, both read-only — step 0 ("is something like this already there?") and step 12 ("which row is the
 * draft I just saved?"). The app never creates or claims a draft on a guess: an unreadable field means "no match".
 */

/** 100-ns ticks of a UUIDv1 count from 1582-10-15; this is the gap to the Unix epoch, in ms. */
const GREGORIAN_TO_UNIX_MS = 12_219_292_800_000n
/** Asia/Tashkent is UTC+5 with no DST (CONSTITUTION §6). */
const TASHKENT_OFFSET_MS = 5n * 60n * 60n * 1000n

const ID_32HEX = /^[0-9a-f]{32}$/i
/** Every cell of a row links to the document: `/documents/{32hex}/1` (didox-flow.md §2a). */
const ID_IN_HREF = /\/documents\/([0-9a-f]{32})\//i
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/
/** spike S4: column [6] is "contract № and date"; the date is the only part with a fixed shape. */
const CONTRACT_DATE = /(\d{2}\.\d{2}\.\d{4})/
/**
 * How Didox may dress the number around it — `№ 12/25 от`, `#12/25`, `12/25 ·` (spike S4 confirms the real wrapping).
 * Both sides of the comparison are normalised, so a prefix in the list does not send every invoice to needs_check
 * (review finding 10).
 */
const NUMBER_DECORATION = /^[\s\u00a0\u00b7,|#-]*(?:\u2116|No\.?|N[\u00b0\u00ba]?)?[\s\u00a0]*|[\s\u00a0]*(?:\u043e\u0442|ot|dan|y\.?|\u0433\.?)?[\s\u00a0\u00b7,|-]*$/gi
/** A 9-digit STIR, however Didox groups the digits. */
const TIN_CANDIDATE = /\d[\d\s  ]*\d/g

export type DraftStatus = 'white' | 'red' | 'other'

/** Raw cell text of one list row, exactly as the page gives it (locators.ts). */
export interface RawListRow {
  /** href of any cell's link. */
  href: string
  /** class attribute of the status cell: `doc-status--white` is a live draft, `--red` a deleted one. */
  statusClass: string
  /** Column [4]: counterparty name and STIR in one blob. */
  counterparty: string
  /** Column [6]: contract number and date in one blob. */
  contract: string
  /** Column [7]: the amount without VAT. */
  amount: string
}

export interface ListRow {
  id: string
  status: DraftStatus
  counterpartyTin: string | null
  contractNumber: string | null
  /** `dd.mm.yyyy`, as the list prints it. */
  contractDate: string | null
  amountTiyin: bigint | null
}

/** What makes a draft "this invoice": the four fields the app itself put into the form. */
export interface DraftKey {
  borrowerTin: string
  contractNumber: string
  contractDate: string
  amountTiyin: bigint
}

/**
 * When the draft must have been created. `toMs: null` leaves the window open at the end (step 0).
 * `unknownTime` decides a row whose id carries no timestamp: step 0 includes it (it may be a duplicate),
 * step 12 excludes it (the app must not claim a document it cannot place in time).
 */
export interface TimeWindow {
  fromMs: bigint
  toMs: bigint | null
  unknownTime: 'include' | 'exclude'
}

export type DraftMatch = { kind: 'one'; id: string } | { kind: 'none' } | { kind: 'many'; ids: string[] }

/**
 * The moment a UUIDv1 was minted, in ms. Null unless the version nibble says v1 — v4 and v7 ids carry no time, and
 * reading one as a timestamp would place a stranger's document inside our window.
 *
 * Deviation from spec §5 (noted for Sir): returns bigint, not a JS number, so this layer needs no float conversion
 * at all and stays inside the no-float guard of money.spec.ts.
 */
export function uuidV1TimeMs(id32hex: string): bigint | null {
  if (!ID_32HEX.test(id32hex)) return null
  const hex = id32hex.toLowerCase()
  if (hex[12] !== '1') return null
  const timeHigh = BigInt(`0x${hex.slice(12, 16)}`) & 0x0fffn
  const timeMid = BigInt(`0x${hex.slice(8, 12)}`)
  const timeLow = BigInt(`0x${hex.slice(0, 8)}`)
  const ticks = (timeHigh << 48n) | (timeMid << 32n) | timeLow
  return ticks / 10_000n - GREGORIAN_TO_UNIX_MS
}

/** First instant of `month` (plus `offset` whole months) in Tashkent, as Unix ms. */
export function monthStartMs(month: string, offset = 0n): bigint {
  const match = MONTH.exec(month)
  if (!match) throw new Error(`Oy formati kutilganidek emas: ${JSON.stringify(month)}`)
  const zeroBased = BigInt(match[1]!) * 12n + BigInt(match[2]!) - 1n + offset
  const shifted = `${zeroBased / 12n}-${String((zeroBased % 12n) + 1n).padStart(2, '0')}`
  return BigInt(Date.parse(`${shifted}-01T00:00:00Z`)) - TASHKENT_OFFSET_MS
}

/** The contract number as it is compared: decoration and inner spacing removed, nothing else. */
export const normalizeContractNumber = (raw: string): string =>
  raw.replace(NUMBER_DECORATION, '').replace(/[\s\u00a0]+/g, '')

/** Null when the row carries no document id: a row the app cannot name is never matched. */
export function parseListRow(row: RawListRow): ListRow | null {
  const id = ID_IN_HREF.exec(row.href)?.[1]
  if (!id) return null
  const contract = parseContractCell(row.contract)
  return {
    id: id.toUpperCase(),
    status: row.statusClass.includes('doc-status--white') ? 'white' : row.statusClass.includes('doc-status--red') ? 'red' : 'other',
    counterpartyTin: parseTin(row.counterparty),
    contractNumber: contract.number,
    contractDate: contract.date,
    amountTiyin: parseDidoxMoney(row.amount),
  }
}

/**
 * Rows that are this invoice's draft. `many` means the person decides — the app would rather mark nothing than
 * attach the wrong Didox document to an invoice.
 */
export function matchOwnDraft(rows: ListRow[], key: DraftKey, window: TimeWindow): DraftMatch {
  const ids = rows.filter((row) => matches(row, key, window)).map((row) => row.id)
  if (!ids.length) return { kind: 'none' }
  return ids.length === 1 ? { kind: 'one', id: ids[0]! } : { kind: 'many', ids }
}

function matches(row: ListRow, key: DraftKey, window: TimeWindow): boolean {
  if (row.status !== 'white') return false
  if (row.counterpartyTin !== key.borrowerTin) return false
  if (row.contractNumber === null || row.contractNumber !== normalizeContractNumber(key.contractNumber)) return false
  if (row.contractDate !== key.contractDate) return false
  if (row.amountTiyin === null || row.amountTiyin !== key.amountTiyin) return false
  const at = uuidV1TimeMs(row.id)
  if (at === null) return window.unknownTime === 'include'
  return at >= window.fromMs && (window.toMs === null || at <= window.toMs)
}

/**
 * The date has a fixed shape; whatever precedes it is the number, normalised for comparison.
 * Both null when the cell does not look like that at all (fail-closed).
 */
function parseContractCell(cell: string): { number: string | null; date: string | null } {
  const match = CONTRACT_DATE.exec(cell)
  if (!match) return { number: null, date: null }
  const number = normalizeContractNumber(cell.slice(0, match.index))
  return number ? { number, date: match[1]! } : { number: null, date: null }
}

/** Exactly one 9-digit group, or nothing: two candidates in a cell mean the STIR cannot be told apart from a name. */
function parseTin(cell: string): string | null {
  const found = new Set(
    [...cell.matchAll(TIN_CANDIDATE)].map((m) => m[0].replace(/[\s  ]/g, '')).filter((digits) => digits.length === 9),
  )
  return found.size === 1 ? [...found][0]! : null
}
