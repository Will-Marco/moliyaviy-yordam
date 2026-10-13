// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as L from './locators.js'
import type { RawListRow } from './parse.js'

/*
 * The locators run against copies of Didox's own DOM, taken during the 2026-10-13 spike and sanitised
 * (firm names, STIRs and the node part of document ids are placeholders). When Didox changes its markup again,
 * these tests keep passing on the old copy — so a failing test here means the locator is wrong, and a passing
 * test is only as current as the fixture. The gate run on the real page is what refreshes them.
 */
const fixture = (name: string) => readFileSync(join(__dirname, 'testing/fixtures', name), 'utf8')

const load = (name: string) => {
  document.body.innerHTML = fixture(name)
}

/** Evaluates a locator the way the page does. */
const run = <T>(loc: L.Locator): T => new Function(`return (${loc.js})`)() as T
const value = (loc: L.Locator) => run<string | null>(loc)
const element = (loc: L.Locator) => run<Element | null>(loc)

describe('form locators', () => {
  describe('header fields', () => {
    beforeEach(() => load('form-empty.html'))

    it('finds each field by the label printed under it', () => {
      expect(element(L.formField('Шартнома рақами'))).toBeInstanceOf(HTMLInputElement)
      expect(element(L.formField('Шартнома санаси'))).toBeInstanceOf(HTMLInputElement)
      expect(element(L.formField('Ҳисоб-фактура рақами'))).toBeInstanceOf(HTMLInputElement)
      expect(element(L.formField('Ҳужжат санаси'))).toBeInstanceOf(HTMLInputElement)
    })

    it('tells the contract number from the contract date, which sit next to each other', () => {
      const number = element(L.formField('Шартнома рақами')) as HTMLInputElement
      const date = element(L.formField('Шартнома санаси')) as HTMLInputElement
      expect(number.className).toContain('input__input--text')
      expect(date.className).toContain('input__input--date')
    })

    it('reads a field that the accountant has not filled as an empty string, not null', () => {
      expect(value(L.formFieldValue('Ҳисоб-фактура рақами'))).toBe('')
    })

    it('resolves to null for a label Didox does not have, so a step fails instead of typing elsewhere', () => {
      expect(element(L.formField('Йўқ майдон'))).toBeNull()
      expect(value(L.formFieldValue('Йўқ майдон'))).toBeNull()
    })
  })

  describe('seller and counterparty', () => {
    beforeEach(() => load('form-empty.html'))

    it("reads the logged-in firm's own STIR from the disabled field", () => {
      expect(value(L.sellerTinValue)).toBe('300000001')
    })

    it('takes the counterparty STIR from the other column, not the seller one', () => {
      const field = element(L.counterpartyTin) as HTMLInputElement
      expect(field).toBeInstanceOf(HTMLInputElement)
      expect(field.disabled).toBe(false)
      expect(field.value).toBe('')
    })

    /*
     * The name box only appears in the counterparty column once Didox has looked the STIR up, and this copy was
     * taken before that — so here the locator must say "not there" rather than hand back an empty name that the
     * step would read as "Didox answered with nothing". The filled case is checked on the real page at the gate.
     */
    it('says the counterparty name is not there yet instead of reading it as empty', () => {
      expect(value(L.counterpartyNameValue)).toBeNull()
    })
  })

  describe('goods row', () => {
    it('finds a cell by its column heading, not by position', () => {
      load('form-empty.html')
      expect(element(L.rowField('Нарҳ'))).toBeInstanceOf(HTMLInputElement)
      expect(element(L.rowField('Сони'))).toBeInstanceOf(HTMLInputElement)
    })

    /*
     * Picking the МХИК adds an "Имтиез" column before "Омбор", so every column after it shifts by one. A locator
     * that counted cells would then read the wrong box — the origin would be read out of the warehouse column.
     */
    it('follows the heading when choosing the МХИК inserts a column', () => {
      load('form-empty.html')
      expect(run<string[]>(L.rowHeadings)).not.toContain('Имтиез')
      const originBefore = run<number>(L.rowColumnIndex('келиб чиқиши'))

      load('form-filled.html')
      expect(run<string[]>(L.rowHeadings)).toContain('Имтиез')
      expect(run<number>(L.rowColumnIndex('келиб чиқиши'))).toBe(originBefore + 1)
    })

    it('reads back what Didox computed from the price', () => {
      load('form-filled.html')
      expect(value(L.rowValue('Нарҳ'))).toBe('552328.77')
      expect(value(L.rowValue('етказиб бериш нарҳи'))).toBe('552328.77')
      expect(value(L.rowValue('Жами'))).toBe('552328.77')
      expect(value(L.rowValue('Сони'))).toBe('1')
    })

    /*
     * Didox leaves the VAT amount box empty for a VAT-free line instead of writing 0 (spike §2c), so the step
     * reads the rate first — an empty box only means zero while the rate says ҚҚСсиз (Sir, 2026-10-13).
     */
    it('reports the VAT rate and the empty VAT amount Didox leaves for a VAT-free line', () => {
      load('form-filled.html')
      expect(value(L.rowValue('ққс, %'))).toBe('ҚҚСсиз')
      expect(value(L.rowValue('ққс, Миқдор'))).toBe('')
    })

    it('reads the unit and the privilege the МХИК brought with it', () => {
      load('form-filled.html')
      expect(value(L.rowValue('ўлчов бирлиги'))).toBe('xizmat (so’m)')
      expect(value(L.rowValue('Имтиез'))).toContain('102898')
    })

    it('resolves to null for a heading that is not there', () => {
      load('form-empty.html')
      expect(element(L.rowField('Йўқ устун'))).toBeNull()
      expect(run<number>(L.rowColumnIndex('Йўқ устун'))).toBe(-1)
    })
  })

  describe('a MUI select in the row', () => {
    beforeEach(() => load('origin-menu.html'))

    it('opens by its input root, because the input itself is disabled for typing', () => {
      const root = element(L.rowSelectRoot('келиб чиқиши')) as HTMLElement
      expect(root).toBeInstanceOf(HTMLElement)
      expect(root.className).toContain('MuiInputBase-root')
      expect(root.querySelector('input')?.disabled ?? false).toBe(false)
    })

    it('lists the options of the list bound to that input', () => {
      expect(run<string[]>(L.rowOptions('келиб чиқиши'))).toEqual([
        'Ўзи ишлаб чиқарган',
        'Олди-сотди',
        'Хизмат кўрсатиш',
        'Иштирок этмайман',
      ])
    })

    it('picks the service option by its exact text', () => {
      const option = element(L.rowOption('келиб чиқиши', L.ORIGIN_SERVICE_LABEL)) as HTMLElement
      expect(option?.textContent?.trim()).toBe('Хизмат кўрсатиш')
    })

    it('resolves to null for an option Didox does not offer', () => {
      expect(element(L.rowOption('келиб чиқиши', 'Йўқ вариант'))).toBeNull()
    })
  })

  describe('the draft list', () => {
    beforeEach(() => load('draft-list.html'))

    it('reads every row as parse.ts expects it', () => {
      const rows = run<RawListRow[]>(L.listRows)
      expect(rows).toHaveLength(3)
      expect(rows[0]).toEqual({
        href: expect.stringMatching(/^\/documents\/[0-9A-F]{32}\/1$/),
        statusClass: expect.stringContaining('doc-status--'),
        counterparty: expect.stringContaining('300000002'),
        contract: expect.any(String),
        amount: expect.any(String),
      })
    })

    it('keeps the deleted/live distinction Didox draws with a class', () => {
      const classes = run<RawListRow[]>(L.listRows).map((r) => r.statusClass)
      expect(classes.some((c) => c.includes('doc-status--white'))).toBe(true)
      expect(classes.some((c) => c.includes('doc-status--red'))).toBe(true)
    })

    it('counts the rows so a full page can be refused as unreliable', () => {
      expect(run<number>(L.listRowCount)).toBe(3)
    })
  })

  describe('login page (after Didox redesigned it)', () => {
    it('finds the closed key select and reports no key picked yet', () => {
      load('login-closed.html')
      expect(element(L.keyPicker)).toBeInstanceOf(HTMLElement)
      expect(run<boolean>(L.keyMenuOpen)).toBe(false)
      expect(value(L.selectedKeyInn)).toBeNull()
    })

    it('reads the keys out of the open menu', () => {
      load('login-menu-open.html')
      expect(run<boolean>(L.keyMenuOpen)).toBe(true)
      expect(run<L.CertItem[]>(L.keyMenuItems)).toEqual([{ inn: '300000001', expire: '21.01.2028' }])
      expect(element(L.keyMenuItem('300000001', '21.01.2028'))).toBeInstanceOf(HTMLElement)
      expect(element(L.keyMenuItem('300000009', null))).toBeNull()
    })
  })

  describe('buttons', () => {
    beforeEach(() => load('form-empty.html'))

    it('finds "Сақлаб қолиш" although Didox wraps the label in a span', () => {
      expect(element(L.saveButton)?.tagName).toBe('BUTTON')
      expect(element(L.saveButton)?.textContent?.trim()).toBe('Сақлаб қолиш')
    })

    it('never names the sign button', () => {
      expect(L.saveButton.js).not.toContain('Имзола')
      expect(L.saveButton.what).not.toContain('Имзола')
    })
  })
})
