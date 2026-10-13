import type { DidoxCode, Page } from '../contract.js'
import { StepError } from '../contract.js'
import { humanPauseMs, step, type StepContext } from '../driver.js'
import type { InvoiceEntry, InvoicePatch } from '../journal.js'
import * as L from '../locators.js'
import { DIDOX_DECIMAL_SEP, formatForDidox, parseDidoxMoney, tiyinOf } from '../money.js'
import { draftKey, dottedDate, openDraftList, readDraftRows, savedWindow } from '../draft-list.js'
import { matchOwnDraft, monthStartMs } from '../parse.js'

/**
 * One invoice, from "is something like this already there?" to "the app owns this draft" (M8c §4, FR-8.4).
 *
 * Two kinds of ending. A returned outcome is this invoice's own business — the firm carries on with the next one.
 * A thrown StepError stops the firm: the page did not look like Didox, so nothing further can be trusted. The split
 * matters for what the accountant has to do, so each step below says which one it is.
 *
 * Steps 0–10 never leave anything in Didox. From step 11 a draft may exist, so every failure after it records
 * `needs_check` with the reason instead of staying silent (§12).
 */

/** What the caller must do next; the journal has already been written when this returns. */
export type DraftOutcome =
  | { kind: 'marked'; didoxId: string }
  /** Saved and identified, but the API did not take it; `flushIdFound` sends it again later. */
  | { kind: 'id_found'; didoxId: string }
  | { kind: 'needs_check'; code: DidoxCode; message: string; didoxId?: string; candidateIds?: string[] }
  /** The app's own API refused the session: the whole run stops, nothing is wrong with Didox. */
  | { kind: 'run_failed'; code: 'API_UNAVAILABLE'; message: string }

/** The journal, already bound to this run's firm and invoice. */
export interface DraftJournal {
  setInvoice(patch: InvoicePatch): Promise<unknown>
  /** Sends the found ID to the API; mirrors `flushIdFound`, so an answer means the same thing in both paths. */
  mark(): Promise<'marked' | 'needs_check' | 'left' | 'unauthorized'>
}

export interface CreateDraftOptions {
  page: Page
  ctx: StepContext
  /** `pending` entry of the journal: what to type, and the amount that goes back to the API as `expectedAmount`. */
  item: InvoiceEntry
  /** Invoice month, `yyyy-mm`: the draft belongs to the month after it. */
  month: string
  /** The firm the app is logged in as; the form must already show it as the seller. */
  lenderTin: string
  journal: DraftJournal
  /** Holds the window between pressing save and writing the ID; the run may not be cancelled inside it (§3). */
  critical: { enter(): void; exit(): void }
  nowMs?: () => number
  random?: () => number
}

const LIST_TIMEOUT_MS = 20_000
const FIELD_TIMEOUT_MS = 15_000
const COUNTERPARTY_TIMEOUT_MS = 10_000
const OPTIONS_TIMEOUT_MS = 10_000
const AUTOCALC_TIMEOUT_MS = 5_000
/** Didox fills the unit, the VAT rate and the relief itself once the МХИК is picked; each lands in its own moment. */
const AUTOFILL_TIMEOUT_MS = 10_000
const SAVE_TIMEOUT_MS = 20_000
/** The notice shows up about two seconds after the form (spike §2c), so it is waited for a little longer. */
const MODAL_WAIT_MS = 8_000
const MODAL_GONE_MS = 10_000
/** Didox needs a moment to list a draft it has just taken; it is asked again, with a reload, a few times (§4 step 12). */
const LOCATE_TRIES = 4
const LOCATE_GAP_MS = 3_000
/*
 * Didox's fields re-render while they are typed into — the date mask opens a calendar, the МХИК box searches on every
 * keystroke — and characters sent during that are lost (spike §2c S2a; the first c1 gate run put `0_.__.____` in the
 * contract date). So every field is read back after it is filled, and filled again if it did not keep what it was
 * given. The settle pauses give the re-render time to finish before the next keystroke arrives.
 */
const FILL_TRIES = 3
/** The notice does not always go on the first press (c2 gate). */
const NOTICE_TRIES = 3
const FIELD_SETTLE_MS = 600

/** What the row must say once the МХИК has been chosen (spike §2c S2). */
const DOC_TYPES = ['Ҳисоб-фактура актсиз', 'Стандарт']
const UNIT_TEXT = 'xizmat (so’m)'
const VAT_FREE_TEXT = 'ҚҚСсиз'
const PRIVILEGE_CODE = '102898'
/** Boxes the app must leave alone; a ticked one changes how the invoice is read (§4 step 10). */
const UNTICKED = ['Қўлда ҳисоблаш', 'Акциз', 'Тескари ҳисоб']

const HEAD_CONTRACT_NUMBER = 'Шартнома рақами'
const HEAD_CONTRACT_DATE = 'Шартнома санаси'
const HEAD_INVOICE_NUMBER = 'Ҳисоб-фактура рақами'
const HEAD_INVOICE_DATE = 'Ҳужжат санаси'
const COL_MXIK = 'МХИК'
const COL_DESCRIPTION = 'изоҳ'
const COL_UNIT = 'ўлчов бирлиги'
const COL_QTY = 'Сони'
const COL_PRICE = 'Нарҳ'
const COL_DELIVERY = 'етказиб бериш нарҳи'
const COL_VAT_RATE = 'ққс, %'
const COL_VAT_AMOUNT = 'ққс, Миқдор'
const COL_TOTAL = 'Жами'
const COL_PRIVILEGE = 'Имтиез'
const COL_ORIGIN = 'келиб чиқиши'

export async function createDraft(opts: CreateDraftOptions): Promise<DraftOutcome> {
  const { page, ctx, item, month, lenderTin, journal, critical } = opts
  const nowMs = opts.nowMs ?? Date.now
  const pause = () => page.pause(humanPauseMs(opts.random))
  const run = <T>(name: string, fn: () => Promise<T>) => step(name, page, ctx, fn)
  const amountTiyin = tiyinOf(item.amount)
  const key = draftKey(item)

  const note = (message: string) => ctx.onProgress?.({ firmTin: ctx.tin, step: 'fill', status: 'running', message })
  /**
   * Closes Didox's notice if it is covering the form; says whether there was one. The click is tried a few times:
   * the notice sometimes stays on the first press, and losing a whole firm to that would be absurd.
   */
  const closeNotice = async (): Promise<boolean> => {
    const isOpen = () => page.read<boolean>(`!!(${L.attentionModalClose.js})`).catch(() => false)
    if (!(await isOpen())) return false
    for (let attempt = 0; attempt < NOTICE_TRIES; attempt++) {
      await page.click(L.attentionModalClose.js, { what: L.attentionModalClose.what, needsPointer: true }).catch(() => undefined)
      await page.pause(FIELD_SETTLE_MS)
      if (!(await isOpen())) return true
    }
    throw new StepError('PAGE_UNEXPECTED', 'Didox ogohlantirish oynasi yopilmadi', 'openForm', null)
  }
  const readValue = (loc: L.Locator) => page.read<string | null>(loc.js)
  const expect = async (loc: L.Locator, want: string, what: string) => {
    const got = await readValue(loc)
    if (got !== want) throw unexpectedValue(what, want, got)
  }

  /* 0 — is a draft like this one already in Didox? Only a person may decide what to do with it. */
  const similar = await run('similarCheck', async () => {
    const rows = await openDraftList(page, item.borrowerTin, LIST_TIMEOUT_MS)
    const match = matchOwnDraft(rows, key, {
      // Drafts for this month are made once it is over; anything older belongs to another month (§5).
      fromMs: monthStartMs(month, 1n),
      toMs: null,
      unknownTime: 'include',
    })
    return match.kind === 'none' ? null : match.kind === 'one' ? [match.id] : match.ids
  })
  if (similar) {
    return await needsCheck(journal, {
      code: 'SIMILAR_DRAFT_EXISTS',
      message: "Didox'da shunga o'xshash qoralama bor — uni tekshiring",
      candidateIds: similar,
    })
  }

  /* 1 — the empty form. Didox shows a VAT notice once per session; it is closed if it appears. */
  await run('openForm', async () => {
    await page.goto(L.CREATE_DOCUMENT_URL)
    await page.waitFor(`(${L.docTypeValues.js}).length === 2`, { timeoutMs: FIELD_TIMEOUT_MS, what: 'hujjat turi' })
    if (await waitQuietly(page, `!!(${L.attentionModalClose.js})`, MODAL_WAIT_MS)) await closeNotice()
    // It can also turn up a moment later, while the type is being checked; the fills below close it too.
  })

  /* 2–3 — the app fills an invoice form of one exact kind, for the firm it logged in as. */
  await run('verifyType', async () => {
    const types = await page.read<string[]>(L.docTypeValues.js)
    if (types.length !== DOC_TYPES.length || DOC_TYPES.some((want, i) => types[i] !== want)) {
      throw unexpectedValue('hujjat turi', DOC_TYPES.join(' / '), types.join(' / '))
    }
  })
  await run('verifySeller', () => expect(L.sellerTinValue, lenderTin, 'sotuvchi STIR'))

  /* 4 — contract number and date, read back exactly as Didox kept them. */
  await run('fillContract', async () => {
    await pause()
    const number = item.contractNumber
    const date = dottedDate(item.contractSignedOn)
    await fillUntil(page, L.formField(HEAD_CONTRACT_NUMBER), number, (v) => v === number, 'shartnoma raqami', number, note, closeNotice)
    // Didox's own mask turns the digits into `dd.mm.yyyy`, so the digits go in and the dotted form comes back.
    await fillUntil(page, L.formField(HEAD_CONTRACT_DATE), digits(item.contractSignedOn), (v) => v === date, 'shartnoma sanasi', date, note, closeNotice)
  })

  /* 5 — Didox fills the counterparty's details from the STIR; the app only checks it got the firm it meant. */
  const mismatch = await run('fillCounterparty', async () => {
    const before = (await readValue(L.counterpartyNameValue)) ?? ''
    await pause()
    await fillUntil(page, L.counterpartyTin, item.borrowerTin, (v) => v === item.borrowerTin, 'kontragent STIR', item.borrowerTin, note, closeNotice)
    const name = await page
      .waitFor<string>(nameArrived(before), { timeoutMs: COUNTERPARTY_TIMEOUT_MS, what: 'kontragent nomi' })
      .catch((error: unknown) => {
        if (error instanceof StepError && error.code === 'TIMEOUT') {
          throw new StepError('COUNTERPARTY_NOT_FILLED', `Didox ${item.borrowerTin} STIR bo'yicha kontragentni to'ldirmadi`)
        }
        throw error
      })
    return sameFirm(name, item.borrowerName) ? null : `Didox: "${name}", ilovada: "${item.borrowerName}"`
  })
  if (mismatch) {
    return await needsCheck(journal, {
      code: 'COUNTERPARTY_MISMATCH',
      message: `Kontragent nomi mos kelmadi (${mismatch})`,
    })
  }

  /* 6 — the МХИК brings the unit, the VAT rate and the tax relief with it; all three are checked, not assumed. */
  await run('fillItem', async () => {
    await pause()
    await fillUntil(page, L.rowField(COL_MXIK), L.INTEREST_MXIK, (v) => v === L.INTEREST_MXIK, 'МХИК kodi', L.INTEREST_MXIK, note, closeNotice, true)
    const option = L.rowOptionStartingWith(COL_MXIK, L.INTEREST_MXIK)
    await page.waitFor(`!!(${option.js})`, { timeoutMs: OPTIONS_TIMEOUT_MS, what: 'МХИК varianti' })
    await page.click(option.js, { what: option.what, needsPointer: true })
    /*
     * Didox applies what the МХИК brings one field at a time — unit, then the VAT rate, then the relief — so each is
     * waited for rather than read the moment the option is clicked (the c1 gate caught the rate still at 12%).
     */
    await settles(page, L.rowValue(COL_UNIT), `v === ${JSON.stringify(UNIT_TEXT)}`, "o'lchov birligi", UNIT_TEXT)
    await settles(page, L.rowValue(COL_VAT_RATE), `v === ${JSON.stringify(VAT_FREE_TEXT)}`, 'ҚҚС stavkasi', VAT_FREE_TEXT)
    await settles(page, L.rowValue(COL_PRIVILEGE), `!!v && v.indexOf(${JSON.stringify(PRIVILEGE_CODE)}) === 0`, 'imtiyoz', PRIVILEGE_CODE)
  })

  /* 7 — the line the accountant sees in the app is the line Didox prints. */
  await run('fillDescription', async () => {
    await pause()
    await fillUntil(page, L.rowField(COL_DESCRIPTION), item.lineName, (v) => v === item.lineName, 'izoh', item.lineName, note, closeNotice)
  })

  /* 8 — the amount. Everything Didox computed from it is compared to the tiyin (§1). */
  await run('fillQtyPrice', async () => {
    await pause()
    const price = formatForDidox(amountTiyin, DIDOX_DECIMAL_SEP)
    await fillUntil(page, L.rowField(COL_QTY), '1', (v) => v === '1', 'soni', '1', note, closeNotice)
    // Didox may print the amount back its own way; what matters is that it means the same number of tiyin.
    await fillUntil(page, L.rowField(COL_PRICE), price, (v) => v !== null && parseDidoxMoney(v) === amountTiyin, 'narx', price, note, closeNotice)
    await page.waitFor(`(${L.rowValue(COL_TOTAL).js}) !== ''`, { timeoutMs: AUTOCALC_TIMEOUT_MS, what: 'Жами' })
    for (const [column, what] of [
      [COL_PRICE, 'narx'],
      [COL_DELIVERY, 'yetkazib berish narxi'],
      [COL_TOTAL, 'jami'],
    ] as const) {
      const shown = await readValue(L.rowValue(column))
      const tiyin = shown === null ? null : parseDidoxMoney(shown)
      if (tiyin !== amountTiyin) throw unexpectedValue(what, item.amount, shown)
    }
    await expectVatFree(page)
  })

  /* 9 — services, not goods (SRS §9.1). */
  await run('setOrigin', async () => {
    await pause()
    const option = L.rowOption(COL_ORIGIN, L.ORIGIN_SERVICE_LABEL)
    await page.selectOption(L.rowSelectRoot(COL_ORIGIN).js, option.js, { what: 'kelib chiqishi' })
    await expect(L.rowValue(COL_ORIGIN), L.ORIGIN_SERVICE_LABEL, 'kelib chiqishi')
  })

  /* 10 — the number and date stay empty (the accountant sets them), and no box the app never ticks is ticked. */
  await run('verifyBlank', async () => {
    await expect(L.formFieldValue(HEAD_INVOICE_NUMBER), '', 'faktura raqami')
    await expect(L.formFieldValue(HEAD_INVOICE_DATE), '', 'faktura sanasi')
    for (const label of UNTICKED) {
      const ticked = await page.read<boolean | null>(L.anyCheckboxTicked(label).js)
      if (ticked !== false) throw unexpectedValue(label, 'belgilanmagan', ticked === null ? 'topilmadi' : 'belgilangan')
    }
  })

  /*
   * 11 — from here a draft may exist in Didox. `saving` reaches the disk *before* the click, so a crash or a power
   * cut still leaves the question "did it save?" for a person instead of losing it.
   */
  const savingAt = new Date(nowMs()).toISOString()
  await journal.setInvoice({ state: 'saving', savingAt, amount: item.amount })
  critical.enter()
  try {
    await run('save', async () => {
      await page.click(L.saveButton.js, { what: L.saveButton.what })
      await page.waitFor(L.atDraftList.js, { timeoutMs: SAVE_TIMEOUT_MS, what: L.atDraftList.what })
    }).catch(async (error: unknown) => {
      // The click may well have saved: only Didox knows, so the invoice is handed over with what the app saw.
      const toast = await page.read<string | null>(L.toastText.js).catch(() => null)
      const reason = error instanceof StepError ? error.message : String(error)
      await needsCheck(journal, {
        code: 'SAVE_FAILED',
        message: `Saqlash tasdiqlanmadi (${reason})${toast ? `. Didox: ${toast}` : ''} — Didox Қоралама'sini tekshiring`,
      })
      throw error instanceof StepError
        ? new StepError('SAVE_FAILED', error.message, error.step, error.screenshot)
        : new StepError('SAVE_FAILED', reason)
    })

    /* 12 — which row of Didox's own list is the draft just saved. */
    const found = await run('locateDraftId', () => locateDraft(page, item, key, savingAt))
    if (found.kind !== 'one') {
      return await needsCheck(journal, found)
    }
    await journal.setInvoice({ state: 'id_found', didoxId: found.id })
    critical.exit()

    /* 13 — the app owns the draft only once its own API has recorded it against the invoice. */
    return await markInApi(journal, found.id)
  } finally {
    critical.exit()
  }
}

type Located =
  | { kind: 'one'; id: string }
  | { kind: 'needs_check'; code: DidoxCode; message: string; candidateIds?: string[] }

/**
 * Didox lists a new draft a moment after it takes it, so the list is read again — with a reload — a few times before
 * the app admits it cannot name what it saved.
 */
async function locateDraft(
  page: Page,
  item: InvoiceEntry,
  key: Parameters<typeof matchOwnDraft>[1],
  savingAt: string,
): Promise<Located> {
  const window = savedWindow(savingAt)
  let last: Located = {
    kind: 'needs_check',
    code: 'SAVED_ID_UNKNOWN',
    message: "Saqlangan qoralama ro'yxatda topilmadi — Didox Қоралама'sini tekshiring",
  }
  for (let attempt = 0; attempt < LOCATE_TRIES; attempt++) {
    let rows
    try {
      if (attempt === 0) {
        rows = await openDraftList(page, item.borrowerTin, LIST_TIMEOUT_MS)
      } else {
        await page.pause(LOCATE_GAP_MS)
        await page.reload()
        await page.waitFor(L.listReady.js, { timeoutMs: LIST_TIMEOUT_MS, what: L.listReady.what })
        rows = await readDraftRows(page)
      }
    } catch (error) {
      if (error instanceof StepError && error.code === 'LIST_TRUNCATED') {
        return { kind: 'needs_check', code: 'LIST_TRUNCATED', message: error.message }
      }
      throw error
    }
    const match = matchOwnDraft(rows, key, window)
    if (match.kind === 'one') return { kind: 'one', id: match.id }
    if (match.kind === 'many') {
      return {
        kind: 'needs_check',
        code: 'SAVED_ID_AMBIGUOUS',
        message: `Bir nechta mos qoralama topildi (${match.ids.length}) — qaysi biri ekanini tanlang`,
        candidateIds: match.ids,
      }
    }
  }
  return last
}

/** Step 13's answers, in the journal's own words. */
async function markInApi(journal: DraftJournal, didoxId: string): Promise<DraftOutcome> {
  let outcome = await journal.mark()
  if (outcome === 'left') outcome = await journal.mark() // a network blip, not an answer about this invoice
  if (outcome === 'marked') return { kind: 'marked', didoxId }
  if (outcome === 'unauthorized') {
    return { kind: 'run_failed', code: 'API_UNAVAILABLE', message: "Ilova o'z API'siga kira olmadi" }
  }
  if (outcome === 'left') return { kind: 'id_found', didoxId }
  return { kind: 'needs_check', code: 'API_REJECTED', message: 'Ilova qoralamani belgilamadi', didoxId }
}

async function needsCheck(
  journal: DraftJournal,
  what: { code: DidoxCode; message: string; candidateIds?: string[]; didoxId?: string },
): Promise<DraftOutcome> {
  await journal.setInvoice({
    state: 'needs_check',
    code: what.code,
    message: what.message,
    ...(what.candidateIds ? { candidateIds: what.candidateIds } : {}),
    ...(what.didoxId ? { didoxId: what.didoxId } : {}),
  })
  return { kind: 'needs_check', ...what }
}

/**
 * Empties the field, types into it and checks what stayed there. `matches` decides what counts as kept: usually the
 * text itself, but a mask prints `01.09.2026` for `01092026` and an amount may come back formatted, so the caller
 * says what it expects to see. Fails as FORM_UNEXPECTED_VALUE — the form is not in the state the app needs.
 */
async function fillUntil(
  page: Page,
  field: L.Locator,
  text: string,
  matches: (shown: string | null) => boolean,
  what: string,
  expected: string,
  note: (message: string) => void = () => undefined,
  clearBlocker: () => Promise<boolean> = async () => false,
  /** Click into the field first: Didox's autocompletes only start searching once they have been opened by hand. */
  clickFirst = false,
): Promise<void> {
  let shown: string | null = null
  for (let attempt = 0; attempt < FILL_TRIES; attempt++) {
    /*
     * Didox can raise its notice while the form is being filled, and nothing typed under it reaches the field
     * (the first c1 gate runs ended exactly here). It is closed before trying again rather than retried into.
     */
    if (attempt > 0 && (await clearBlocker())) note("Didox ogohlantirish oynasi yopildi — qaytadan yoziladi")
    // Didox pre-fills some fields, and typing into one that still holds its old value would append (§9).
    await page.clear(field.js, { what: field.what })
    await page.pause(FIELD_SETTLE_MS)
    /*
     * The keyboard is the normal way in — the МХИК box only searches when it is really typed into. A masked field
     * can refuse keystrokes outright, so the last attempt puts the value in directly; either way the field is read
     * back, and the fallback is said out loud in the live log rather than hidden.
     */
    if (clickFirst) await page.click(field.js, { what: field.what, needsPointer: true }).catch(() => undefined)
    const lastTry = attempt === FILL_TRIES - 1
    if (lastTry) {
      note(`${field.what} klaviaturadan yozilmadi — qiymat to'g'ridan-to'g'ri qo'yildi`)
      await page.setValue(field.js, text, { what: field.what })
    } else {
      await page.type(field.js, text, { what: field.what })
    }
    await page.pause(FIELD_SETTLE_MS)
    shown = await page.read<string | null>(valueOf(field))
    if (matches(shown)) return
  }
  throw unexpectedValue(what, expected, shown)
}

const valueOf = (field: L.Locator) => `(() => { const el = ${field.js}; return el ? el.value : null })()`

/** A probe that turns truthy only once Didox has put a name there that is not the one from before. */
const nameArrived = (before: string) =>
  `(() => { const v = ${L.counterpartyNameValue.js}; return v && v !== ${JSON.stringify(before)} ? v : null })()`

/**
 * Didox leaves the VAT amount box empty for a VAT-free line instead of writing 0 (spike §2c), so the rate decides:
 * empty means zero only while the line really is ҚҚСсиз (Sir, 2026-10-13).
 */
async function expectVatFree(page: Page): Promise<void> {
  const rate = await page.read<string | null>(L.rowValue(COL_VAT_RATE).js)
  if (rate !== VAT_FREE_TEXT) throw unexpectedValue('ҚҚС stavkasi', VAT_FREE_TEXT, rate)
  const shown = await page.read<string | null>(L.rowValue(COL_VAT_AMOUNT).js)
  if (shown === '') return
  if (shown === null || parseDidoxMoney(shown) !== 0n) throw unexpectedValue('ҚҚС miqdori', '0', shown)
}

/**
 * Waits for a field Didox fills by itself to hold what it should. A timeout is reported as the wrong value, not as
 * "the page stopped answering": what the accountant needs to see is which field disagreed and what was in it.
 */
async function settles(page: Page, loc: L.Locator, condition: string, what: string, expected: string): Promise<void> {
  try {
    await page.waitFor(`(() => { const v = ${loc.js}; return ${condition} })()`, { timeoutMs: AUTOFILL_TIMEOUT_MS, what })
  } catch {
    const shown = await page.read<string | null>(loc.js).catch(() => null)
    throw unexpectedValue(what, expected, shown)
  }
}

/** waitFor that answers "it did not appear" instead of failing the step (the VAT notice may simply not be there). */
async function waitQuietly(page: Page, snippet: string, timeoutMs: number): Promise<boolean> {
  try {
    await page.waitFor(snippet, { timeoutMs, what: 'ogohlantirish oynasi' })
    return true
  } catch {
    return false
  }
}

const unexpectedValue = (what: string, want: string, got: string | null) =>
  new StepError(
    'FORM_UNEXPECTED_VALUE',
    `Didox formasida "${what}" kutilganidek emas (kutilgan: ${want}, bor: ${got === null ? 'topilmadi' : got || "bo'sh"})`,
  )

/** `yyyy-mm-dd` → `ddmmyyyy` for typing; Didox's mask adds the dots (`dottedDate` reads them back). */
const digits = (signedOn: string) => `${signedOn.slice(8, 10)}${signedOn.slice(5, 7)}${signedOn.slice(0, 4)}`

/**
 * Two firm names mean the same firm when one contains the other once the legal form and the punctuation are gone:
 * Didox prints `"BETA TRADE" MCHJ`, the app may hold `Beta Trade`.
 */
function sameFirm(fromDidox: string, fromApp: string): boolean {
  const a = normalizeFirmName(fromDidox)
  const b = normalizeFirmName(fromApp)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

const LEGAL_FORMS = /\b(mchj|мчж|ооо|оао|llc|ltd|aj|ат|xk|хк|qmj|кфй)\b/g

const normalizeFirmName = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[«»"'`’‘]/g, ' ')
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
