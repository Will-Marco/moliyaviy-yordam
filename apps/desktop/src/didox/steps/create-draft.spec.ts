import { describe, expect, it, vi } from 'vitest'
import { StepError } from '../contract.js'
import type { InvoiceEntry, InvoicePatch } from '../journal.js'
import * as L from '../locators.js'
import { FakePage } from '../testing/fake-page.js'
import { createDraft, type DraftJournal } from './create-draft.js'

/*
 * The whole step on a fake page: every answer Didox would give is set here, so a test changes one of them and shows
 * what the app does when that one thing is different. The journal is recorded, because when a patch is written
 * (before the click, before marking) is as much a part of the behaviour as what it says.
 */

const ITEM: InvoiceEntry = {
  contractId: 'c-1',
  contractNumber: '12/25',
  contractSignedOn: '2026-09-01',
  borrowerTin: '300000002',
  borrowerName: '"BETA TRADE" MCHJ',
  lineName: 'Foiz — 2026-09',
  amount: '552328.77',
  state: 'pending',
}
/*
 * The draft id below is a real UUIDv1 taken during the spike: it carries 2026-10-13T09:32:30Z inside it. The month
 * and the clock are set around that, so the time windows the step uses (a draft is made in the month after the one
 * it bills; its own save is minutes before it is listed) are the real ones rather than numbers made to fit.
 */
const MONTH = '2026-09'
const LENDER_TIN = '300000001'
const DRAFT_ID = '032704ECC6E911F1AD74FA163EA3FD69'

/** A row of Didox's list, as the locator hands it over. */
const row = (over: Partial<{ id: string; tin: string; contract: string; amount: string; status: string }> = {}) => ({
  href: `/documents/${over.id ?? DRAFT_ID}/1`,
  statusClass: `doc-status ${over.status ?? 'doc-status--white'}`,
  counterparty: `"BETA TRADE" MCHJ${over.tin ?? '300000002'}`,
  contract: over.contract ?? '12/25 01.09.2026',
  amount: over.amount ?? '552 328.77',
})

/** What `settles` polls: the field's value put through a page-side condition. */
const settling = (loc: L.Locator, condition: string) => `(() => { const v = ${loc.js}; return ${condition} })()`

/** The probe create-draft reads a field back with. */
const valueOf = (field: L.Locator) => `(() => { const el = ${field.js}; return el ? el.value : null })()`

const FIELD = {
  contractNumber: L.formField('Шартнома рақами'),
  contractDate: L.formField('Шартнома санаси'),
  counterpartyTin: L.counterpartyTin,
  mxik: L.rowField('МХИК'),
  description: L.rowField('изоҳ'),
  qty: L.rowField('Сони'),
  price: L.rowField('Нарҳ'),
}

interface SceneOptions {
  /** What the draft list answers, call by call: the first read, then the reloads. */
  listRows?: (() => unknown)[]
  counterpartyName?: string
  docTypes?: string[]
  sellerTin?: string
  unit?: string
  vatRate?: string
  vatAmount?: string
  privilege?: string
  total?: string
  mxikTyped?: string[]
  /** What the date mask shows after each attempt — the real one keeps only the first digit when typed into too fast. */
  dateShown?: string[]
  saveFails?: boolean
  attentionModal?: boolean
}

function scene(options: SceneOptions = {}) {
  const page = new FakePage()
  const lists = options.listRows ?? [() => [], () => [row()]]
  let listCall = 0
  const nextList = () => {
    const answer = lists[Math.min(listCall, lists.length - 1)]!
    listCall++
    return answer()
  }
  const mxik = options.mxikTyped ?? [L.INTEREST_MXIK]
  let mxikCall = 0
  const unit = options.unit ?? 'xizmat (so’m)'
  const vatRate = options.vatRate ?? 'ҚҚСсиз'
  const privilege = options.privilege ?? '102898 - (SK 244-m.)'
  const dates = options.dateShown ?? ['01.09.2026']
  let dateCall = 0
  /** What the fake field gives back: what was typed into it, unless the test says otherwise. */
  const typedInto = (field: L.Locator) => () => page.values.get(field.js) ?? ''

  page
    .on(L.listReady.js, true)
    .on(L.listRows.js, () => nextList())
    .on(`(${L.docTypeValues.js}).length === 2`, true)
    .on(L.docTypeValues.js, options.docTypes ?? ['Ҳисоб-фактура актсиз', 'Стандарт'])
    .on(`!!(${L.attentionModalClose.js})`, !!options.attentionModal)
    .on(`!(${L.attentionModalClose.js})`, true)
    .on(L.sellerTinValue.js, options.sellerTin ?? LENDER_TIN)
    .on(L.formFieldValue('Шартнома рақами').js, typedInto(FIELD.contractNumber))
    .on(valueOf(FIELD.contractNumber), typedInto(FIELD.contractNumber))
    .on(valueOf(FIELD.contractDate), () => dates[Math.min(dateCall++, dates.length - 1)])
    .on(valueOf(FIELD.counterpartyTin), typedInto(FIELD.counterpartyTin))
    .on(valueOf(FIELD.description), typedInto(FIELD.description))
    .on(valueOf(FIELD.qty), typedInto(FIELD.qty))
    .on(valueOf(FIELD.price), typedInto(FIELD.price))
    .on(L.formFieldValue('Ҳисоб-фактура рақами').js, '')
    .on(L.formFieldValue('Ҳужжат санаси').js, '')
    .on(L.counterpartyNameValue.js, '')
    .on(valueOf(FIELD.mxik), () => mxik[Math.min(mxikCall++, mxik.length - 1)])
    .on(`!!(${L.rowOptionStartingWith('МХИК', L.INTEREST_MXIK).js})`, true)
    .on(L.rowValue('ўлчов бирлиги').js, unit)
    .on(L.rowValue('ққс, %').js, vatRate)
    .on(L.rowValue('ққс, Миқдор').js, options.vatAmount ?? '')
    .on(L.rowValue('Имтиез').js, privilege)
    // What the step waits for after the МХИК is picked: Didox fills each of these in its own moment.
    .on(settling(L.rowValue('ўлчов бирлиги'), `v === ${JSON.stringify('xizmat (so’m)')}`), () => unit === 'xizmat (so’m)')
    .on(settling(L.rowValue('ққс, %'), `v === ${JSON.stringify('ҚҚСсиз')}`), () => vatRate === 'ҚҚСсиз')
    .on(settling(L.rowValue('Имтиез'), `!!v && v.indexOf(${JSON.stringify('102898')}) === 0`), () => privilege.startsWith('102898'))
    .on(L.rowValue('изоҳ').js, () => page.values.get(L.rowField('изоҳ').js) ?? '')
    .on(L.rowValue('Сони').js, () => page.values.get(L.rowField('Сони').js) ?? '')
    .on(`(${L.rowValue('Жами').js}) !== ''`, true)
    .on(L.rowValue('Нарҳ').js, '552328.77')
    .on(L.rowValue('етказиб бериш нарҳи').js, '552328.77')
    .on(L.rowValue('Жами').js, options.total ?? '552328.77')
    .on(L.rowValue('келиб чиқиши').js, 'Олди-сотди')
    .on(L.anyCheckboxTicked('Қўлда ҳисоблаш').js, false)
    .on(L.anyCheckboxTicked('Акциз').js, false)
    .on(L.anyCheckboxTicked('Тескари ҳисоб').js, false)
    .on(L.atDraftList.js, !options.saveFails)
    .on(L.toastText.js, options.saveFails ? 'Хатолик' : null)

  // Didox fills the counterparty name a moment after the STIR is typed.
  const name = options.counterpartyName === undefined ? '"BETA TRADE" MCHJ' : options.counterpartyName
  page.on(
    `(() => { const v = ${L.counterpartyNameValue.js}; return v && v !== ${JSON.stringify('')} ? v : null })()`,
    name || null,
  )
  // Picking the origin makes the select show it.
  page.onSelect.set(L.rowOption('келиб чиқиши', L.ORIGIN_SERVICE_LABEL).js, (p) =>
    p.on(L.rowValue('келиб чиқиши').js, L.ORIGIN_SERVICE_LABEL),
  )

  const patches: InvoicePatch[] = []
  const marks: string[] = []
  const journal: DraftJournal = {
    setInvoice: async (patch) => {
      patches.push(patch)
      return undefined
    },
    mark: async () => {
      const answer = (marks.shift() ?? 'marked') as 'marked' | 'needs_check' | 'left' | 'unauthorized'
      return answer
    },
  }
  const critical = { entered: 0, exited: 0, enter: () => void critical.entered++, exit: () => void critical.exited++ }
  const events: string[] = []

  const call = () =>
    createDraft({
      page,
      ctx: { tin: LENDER_TIN, signal: new AbortController().signal, onProgress: (e) => events.push(`${e.step}:${e.status}`) },
      item: ITEM,
      month: MONTH,
      lenderTin: LENDER_TIN,
      journal,
      critical,
      nowMs: () => Date.parse('2026-10-13T09:32:00.000Z'),
      random: () => 0,
    })

  return { page, call, patches, marks, critical, events }
}

describe('createDraft', () => {
  it('fills the form, saves, finds the draft and marks it', async () => {
    const s = scene()

    await expect(s.call()).resolves.toEqual({ kind: 'marked', didoxId: DRAFT_ID })

    expect(s.page.of('type').map((c) => c.text)).toEqual([
      '12/25',
      '01092026', // Didox's own mask puts the dots in
      '300000002',
      L.INTEREST_MXIK,
      'Foiz — 2026-09',
      '1',
      '552328.77',
    ])
    expect(s.page.of('clear')).toHaveLength(7) // every field is emptied before it is typed into
    expect(s.events).toContain('save:done')
    expect(s.events).toContain('locateDraftId:done')
  })

  it('never asks the page for a sign or send button', async () => {
    const s = scene()
    await s.call()
    const touched = [...s.page.of('click').map((c) => c.what), ...s.page.of('selectOption').map((c) => c.what)]
    for (const what of touched) expect(what).not.toMatch(/Имзола|Юбор|sign|send/i)
  })

  it('empties every field before typing into it, so Didox\'s own value cannot be appended to', async () => {
    const s = scene()
    await s.call()
    for (const typed of s.page.of('type')) {
      expect(s.page.of('clear').some((c) => c.snippet === typed.snippet)).toBe(true)
    }
  })

  describe('before anything is written to Didox', () => {
    it('hands a similar draft to a person instead of making a second one', async () => {
      const s = scene({ listRows: [() => [row()]] })

      await expect(s.call()).resolves.toEqual({
        kind: 'needs_check',
        code: 'SIMILAR_DRAFT_EXISTS',
        message: expect.stringContaining("o'xshash"),
        candidateIds: [DRAFT_ID],
      })
      expect(s.page.of('goto').map((c) => c.url)).not.toContain(L.CREATE_DOCUMENT_URL)
      expect(s.patches).toEqual([expect.objectContaining({ state: 'needs_check', code: 'SIMILAR_DRAFT_EXISTS' })])
    })

    it('stops the firm when the list is too long to be the whole answer', async () => {
      const s = scene({ listRows: [() => Array.from({ length: L.DRAFT_LIST_LIMIT }, (_, i) => row({ id: `${i}` }))] })

      await expect(s.call()).rejects.toMatchObject({ code: 'LIST_TRUNCATED' })
    })

    it('refuses a form that is not the invoice kind it knows', async () => {
      const s = scene({ docTypes: ['Гибрид ҳисоб-фактура', 'Стандарт'] })
      await expect(s.call()).rejects.toMatchObject({ code: 'FORM_UNEXPECTED_VALUE' })
    })

    it('refuses to fill a form opened as another firm', async () => {
      const s = scene({ sellerTin: '300000009' })
      await expect(s.call()).rejects.toMatchObject({ code: 'FORM_UNEXPECTED_VALUE' })
    })

    it('stops when Didox does not answer with the counterparty', async () => {
      const s = scene({ counterpartyName: '' })
      await expect(s.call()).rejects.toMatchObject({ code: 'COUNTERPARTY_NOT_FILLED' })
    })

    it('leaves a counterparty whose name does not match to a person', async () => {
      const s = scene({ counterpartyName: '"GAMMA LAB" MCHJ' })

      await expect(s.call()).resolves.toMatchObject({ kind: 'needs_check', code: 'COUNTERPARTY_MISMATCH' })
      expect(s.page.of('click').some((c) => c.what.includes('Сақлаб'))).toBe(false)
    })

    it('accepts the same firm written differently', async () => {
      const s = scene({ counterpartyName: 'Beta Trade' })
      await expect(s.call()).resolves.toMatchObject({ kind: 'marked' })
    })

    it('types the МХИК again when the box kept only part of it', async () => {
      const s = scene({ mxikTyped: ['1040199900100', L.INTEREST_MXIK] })

      await expect(s.call()).resolves.toMatchObject({ kind: 'marked' })
      expect(s.page.of('type').filter((c) => c.text === L.INTEREST_MXIK)).toHaveLength(2)
    })

    it('gives up on a МХИК box that never holds the whole code', async () => {
      const s = scene({ mxikTyped: ['1040199900100'] })
      await expect(s.call()).rejects.toMatchObject({ code: 'FORM_UNEXPECTED_VALUE' })
    })

    /*
     * The first c1 gate run ended here: the date mask opened its calendar, re-rendered, and kept only the `0`
     * (`0_.__.____`). Typing it again is what the step does now.
     */
    it('types the date again when the mask kept only the first digit', async () => {
      const s = scene({ dateShown: ['0_.__.____', '01.09.2026'] })

      await expect(s.call()).resolves.toMatchObject({ kind: 'marked' })
      expect(s.page.of('type').filter((c) => c.text === '01092026')).toHaveLength(2)
    })

    it('refuses the form when the date never takes', async () => {
      const s = scene({ dateShown: ['0_.__.____'] })
      await expect(s.call()).rejects.toMatchObject({ code: 'FORM_UNEXPECTED_VALUE' })
    })

    it.each([
      ['unit', { unit: 'dona' }],
      ['VAT rate', { vatRate: '12%' }],
      ['tax relief', { privilege: '' }],
      ['total', { total: '618608.22' }],
    ])('refuses the form when the %s is not what the МХИК should have brought', async (_what, over) => {
      const s = scene(over)
      await expect(s.call()).rejects.toMatchObject({ code: 'FORM_UNEXPECTED_VALUE' })
    })

    /* Didox leaves the VAT box empty for a VAT-free line; that is zero only while the rate says so (Sir, 2026-10-13). */
    it('takes an empty VAT amount as zero on a VAT-free line', async () => {
      const s = scene({ vatAmount: '' })
      await expect(s.call()).resolves.toMatchObject({ kind: 'marked' })
    })

    it('refuses an empty VAT amount when the rate is not VAT-free', async () => {
      const s = scene({ vatRate: '12%', vatAmount: '' })
      await expect(s.call()).rejects.toMatchObject({ code: 'FORM_UNEXPECTED_VALUE' })
    })
  })

  describe('saving', () => {
    it('writes "saving" to the journal before it presses the button', async () => {
      const s = scene()
      const order: string[] = []
      const page = s.page
      page.onClick.set(L.saveButton.js, () => order.push('click'))

      await createDraft({
        page,
        ctx: { tin: LENDER_TIN, signal: new AbortController().signal },
        item: ITEM,
        month: MONTH,
        lenderTin: LENDER_TIN,
        journal: {
          setInvoice: async (patch) => void order.push(`journal:${patch.state}`),
          mark: async () => 'marked',
        },
        critical: { enter: () => order.push('critical:enter'), exit: () => order.push('critical:exit') },
        nowMs: () => Date.parse('2026-10-13T09:32:00.000Z'),
        random: () => 0,
      })

      expect(order.slice(0, 3)).toEqual(['journal:saving', 'critical:enter', 'click'])
    })

    it('anchors the recovery window on the moment it was about to save', async () => {
      const s = scene()
      await s.call()
      expect(s.patches[0]).toEqual({ state: 'saving', savingAt: '2026-10-13T09:32:00.000Z', amount: '552328.77' })
    })

    it('says a draft may exist when saving was not confirmed', async () => {
      const s = scene({ saveFails: true })

      await expect(s.call()).rejects.toMatchObject({ code: 'SAVE_FAILED' })
      expect(s.patches.at(-1)).toMatchObject({
        state: 'needs_check',
        code: 'SAVE_FAILED',
        message: expect.stringContaining('Хатолик'),
      })
    })

    it('lets go of the critical section however it ends', async () => {
      const s = scene({ saveFails: true })
      await s.call().catch(() => undefined)
      expect(s.critical.exited).toBeGreaterThan(0)
    })
  })

  describe('finding the saved draft', () => {
    it('looks again, with a reload, until Didox lists it', async () => {
      const s = scene({ listRows: [() => [], () => [], () => [row()]] })

      await expect(s.call()).resolves.toMatchObject({ kind: 'marked', didoxId: DRAFT_ID })
      expect(s.page.of('reload').length).toBeGreaterThan(0)
    })

    it('hands over an unidentified draft instead of claiming one', async () => {
      const s = scene({ listRows: [() => []] })

      await expect(s.call()).resolves.toMatchObject({ kind: 'needs_check', code: 'SAVED_ID_UNKNOWN' })
      expect(s.patches.at(-1)).toMatchObject({ state: 'needs_check', code: 'SAVED_ID_UNKNOWN' })
    })

    it('leaves the choice to a person when two rows fit', async () => {
      const second = '132704ECC6E911F1AD74FA163EA3FD69'
      const s = scene({ listRows: [() => [], () => [row(), row({ id: second })]] })

      await expect(s.call()).resolves.toMatchObject({
        kind: 'needs_check',
        code: 'SAVED_ID_AMBIGUOUS',
        candidateIds: [DRAFT_ID, second],
      })
    })

    it('does not take a deleted draft for its own', async () => {
      const s = scene({ listRows: [() => [], () => [row({ status: 'doc-status--red' })]] })
      await expect(s.call()).resolves.toMatchObject({ kind: 'needs_check', code: 'SAVED_ID_UNKNOWN' })
    })

    it('writes the ID down before telling the API about it', async () => {
      const s = scene()
      await s.call()
      const states = s.patches.map((p) => p.state)
      expect(states).toEqual(['saving', 'id_found'])
      expect(s.patches.at(-1)).toMatchObject({ state: 'id_found', didoxId: DRAFT_ID })
    })
  })

  describe('marking it in the app', () => {
    it('keeps the ID when the API could not be reached, so it is sent again later', async () => {
      const s = scene()
      s.marks.push('left', 'left')

      await expect(s.call()).resolves.toEqual({ kind: 'id_found', didoxId: DRAFT_ID })
    })

    it('tries once more after a blip', async () => {
      const s = scene()
      s.marks.push('left', 'marked')

      await expect(s.call()).resolves.toEqual({ kind: 'marked', didoxId: DRAFT_ID })
    })

    it('stops the run when the app\'s own API refuses the session', async () => {
      const s = scene()
      s.marks.push('unauthorized')

      await expect(s.call()).resolves.toEqual({
        kind: 'run_failed',
        code: 'API_UNAVAILABLE',
        message: expect.any(String),
      })
    })

    it('reports a rejection with the draft id, so the person can find it', async () => {
      const s = scene()
      s.marks.push('needs_check')

      await expect(s.call()).resolves.toMatchObject({ kind: 'needs_check', code: 'API_REJECTED', didoxId: DRAFT_ID })
    })
  })

  /* Didox raises its notice ~2 s after the form loads, and anything typed under it is lost (the c1 gate runs). */
  it('closes a notice that appears while the form is being filled, then types again', async () => {
    const s = scene({ dateShown: ['__.__.____', '01.09.2026'] })
    let noticeOpen = true
    s.page.on(`!!(${L.attentionModalClose.js})`, () => noticeOpen)
    s.page.on(`!(${L.attentionModalClose.js})`, () => !noticeOpen)
    s.page.onClick.set(L.attentionModalClose.js, () => {
      noticeOpen = false
    })

    await expect(s.call()).resolves.toMatchObject({ kind: 'marked' })

    expect(s.page.of('click').filter((c) => c.what === L.attentionModalClose.what).length).toBeGreaterThan(0)
    expect(s.page.of('type').filter((c) => c.text === '01092026')).toHaveLength(2)
  })

  it('closes the attention notice when Didox shows one', async () => {
    const s = scene({ attentionModal: true })
    let noticeOpen = true
    s.page.on(`!!(${L.attentionModalClose.js})`, () => noticeOpen)
    s.page.onClick.set(L.attentionModalClose.js, () => {
      noticeOpen = false
    })

    await expect(s.call()).resolves.toMatchObject({ kind: 'marked' })
    expect(s.page.of('click').some((c) => c.what === L.attentionModalClose.what)).toBe(true)
  })

  /* One press does not always take it away (c2 gate), and losing the firm to that would be absurd. */
  it('presses the notice away again when it stays after the first press', async () => {
    const s = scene({ attentionModal: true })
    let presses = 0
    s.page.on(`!!(${L.attentionModalClose.js})`, () => presses < 2)
    s.page.onClick.set(L.attentionModalClose.js, () => {
      presses++
    })

    await expect(s.call()).resolves.toMatchObject({ kind: 'marked' })
    expect(presses).toBeGreaterThanOrEqual(2)
  })

  it('stops the firm when the notice will not go at all', async () => {
    const s = scene({ attentionModal: true })
    s.page.on(`!!(${L.attentionModalClose.js})`, true)

    await expect(s.call()).rejects.toMatchObject({ code: 'PAGE_UNEXPECTED' })
  })

  it('reports a cancelled run as cancelled, not as a page fault', async () => {
    const controller = new AbortController()
    controller.abort()
    const s = scene()

    await expect(
      createDraft({
        page: s.page,
        ctx: { tin: LENDER_TIN, signal: controller.signal },
        item: ITEM,
        month: MONTH,
        lenderTin: LENDER_TIN,
        journal: { setInvoice: async () => undefined, mark: async () => 'marked' },
        critical: { enter: vi.fn(), exit: vi.fn() },
      }),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('refuses an amount the API did not write as a plain number', async () => {
    const s = scene()
    await expect(
      createDraft({
        page: s.page,
        ctx: { tin: LENDER_TIN, signal: new AbortController().signal },
        item: { ...ITEM, amount: '552 328,77' },
        month: MONTH,
        lenderTin: LENDER_TIN,
        journal: { setInvoice: async () => undefined, mark: async () => 'marked' },
        critical: { enter: vi.fn(), exit: vi.fn() },
      }),
    ).rejects.toBeInstanceOf(Error)
  })
})

describe('StepError from createDraft', () => {
  it('carries the step name and a screenshot for the firm summary', async () => {
    const s = scene({ sellerTin: '300000009' })
    const error = await s.call().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StepError)
    expect((error as StepError).step).toBe('verifySeller')
    expect((error as StepError).screenshot).toBe('/diag/verifySeller.png')
  })
})
