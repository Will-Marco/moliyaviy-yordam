import { describe, expect, it } from 'vitest'
import {
  matchOwnDraft,
  monthStartMs,
  normalizeContractNumber,
  parseListRow,
  type RawListRow,
  uuidV1TimeMs,
} from './parse.js'

/** Builds a UUIDv1 (dashless, as Didox links carry it) for a moment — the layout uuidV1TimeMs reads back. */
function v1(ms: bigint, { version = 1n, node = '9f1b2c3d4e5f' } = {}): string {
  const ticks = (ms + 12_219_292_800_000n) * 10_000n
  const low = ticks & 0xffffffffn
  const mid = (ticks >> 32n) & 0xffffn
  const hi = ((ticks >> 48n) & 0x0fffn) | (version << 12n)
  const hex = (value: bigint, width: number) => value.toString(16).padStart(width, '0')
  return `${hex(low, 8)}${hex(mid, 4)}${hex(hi, 4)}a1b2${node}`.toUpperCase()
}

const SAVED_AT = 1_760_000_000_000n // 2025-10-09T07:33:20Z

describe('uuidV1TimeMs (§5)', () => {
  it('reads the moment a UUIDv1 was minted', () => {
    expect(uuidV1TimeMs(v1(SAVED_AT))).toBe(SAVED_AT)
    expect(uuidV1TimeMs(v1(0n))).toBe(0n)
    expect(uuidV1TimeMs(v1(SAVED_AT).toLowerCase())).toBe(SAVED_AT)
  })

  it('returns null unless the version nibble is 1 — only v1 carries a timestamp', () => {
    expect(uuidV1TimeMs(v1(SAVED_AT, { version: 4n }))).toBeNull()
    expect(uuidV1TimeMs(v1(SAVED_AT, { version: 7n }))).toBeNull()
  })

  it('returns null for anything that is not 32 hex characters', () => {
    for (const bad of ['', 'not-a-uuid', v1(SAVED_AT).slice(0, 31), `${v1(SAVED_AT)}0`, v1(SAVED_AT).replace(/^./, 'Z')]) {
      expect(uuidV1TimeMs(bad), bad).toBeNull()
    }
  })
})

describe('monthStartMs (§5) — Tashkent is UTC+5 all year', () => {
  it('gives the first instant of the month in Tashkent', () => {
    // 2026-10-01 00:00 Tashkent = 2026-09-30 19:00 UTC
    expect(monthStartMs('2026-10')).toBe(BigInt(Date.parse('2026-09-30T19:00:00Z')))
  })

  it('offsets by whole months, across the year boundary', () => {
    expect(monthStartMs('2026-09', 1n)).toBe(monthStartMs('2026-10'))
    expect(monthStartMs('2026-12', 1n)).toBe(monthStartMs('2027-01'))
    expect(monthStartMs('2026-01', -1n)).toBe(monthStartMs('2025-12'))
  })

  it('refuses a month it cannot read', () => {
    for (const bad of ['2026-13', '26-01', '2026-1', '', '2026-00']) {
      expect(() => monthStartMs(bad), bad).toThrow(/oy/i)
    }
  })
})

const raw = (over: Partial<RawListRow> = {}): RawListRow => ({
  href: `/documents/${v1(SAVED_AT)}/1`,
  statusClass: 'doc-status doc-status--white',
  counterparty: 'BETA AGRO MCHJ\n302 222 222',
  contract: '12/25 · 01.12.2025',
  amount: '552 328,77',
  ...over,
})

describe('parseListRow (§5)', () => {
  it('reads one draft row', () => {
    expect(parseListRow(raw())).toEqual({
      id: v1(SAVED_AT),
      status: 'white',
      counterpartyTin: '302222222',
      contractNumber: '12/25',
      contractDate: '01.12.2025',
      amountTiyin: 55232877n,
    })
  })

  it('tells a live draft from a deleted one', () => {
    expect(parseListRow(raw({ statusClass: 'doc-status doc-status--red' }))?.status).toBe('red')
    expect(parseListRow(raw({ statusClass: 'doc-status doc-status--green' }))?.status).toBe('other')
    expect(parseListRow(raw({ statusClass: '' }))?.status).toBe('other')
  })

  it('returns null without an id — a row we cannot name is never ours', () => {
    expect(parseListRow(raw({ href: '/documents/new/draft' }))).toBeNull()
    expect(parseListRow(raw({ href: '' }))).toBeNull()
    expect(parseListRow(raw({ href: '/documents/ZZZZ/1' }))).toBeNull()
  })

  it('leaves a field null when it cannot be read, instead of guessing', () => {
    expect(parseListRow(raw({ amount: 'ҚҚСсиз' }))?.amountTiyin).toBeNull()
    expect(parseListRow(raw({ amount: '552328.765' }))?.amountTiyin).toBeNull()
    expect(parseListRow(raw({ contract: 'shartnomasiz' }))).toMatchObject({ contractNumber: null, contractDate: null })
    expect(parseListRow(raw({ counterparty: 'BETA AGRO MCHJ' }))?.counterpartyTin).toBeNull()
    // Two 9-digit groups: which one is the STIR is a guess, so neither is taken.
    expect(parseListRow(raw({ counterparty: 'FIRMA 123456789 MCHJ\n302 222 222' }))?.counterpartyTin).toBeNull()
  })

  it('reads the TIN whether or not Didox groups its digits', () => {
    expect(parseListRow(raw({ counterparty: 'BETA\n302222222' }))?.counterpartyTin).toBe('302222222')
    expect(parseListRow(raw({ counterparty: 'BETA\n302 222 222' }))?.counterpartyTin).toBe('302222222')
  })

  it('reads the contract number and date out of one cell', () => {
    expect(parseListRow(raw({ contract: '12/25\n01.12.2025' }))).toMatchObject({ contractNumber: '12/25', contractDate: '01.12.2025' })
  })

  // Review finding 10: Didox may wrap the number; the app's own number ('7') has to keep matching it.
  it('strips the decoration Didox puts around the number', () => {
    for (const cell of ['№ 7 от 05.01.2026', '#7 · 05.01.2026', '7 05.01.2026', 'N 7, 05.01.2026', '№7 05.01.2026']) {
      expect(parseListRow(raw({ contract: cell })), cell).toMatchObject({ contractNumber: '7', contractDate: '05.01.2026' })
    }
    expect(normalizeContractNumber('№ 12/25 от')).toBe('12/25')
    expect(normalizeContractNumber('12/25')).toBe('12/25')
    expect(normalizeContractNumber('12 / 25')).toBe('12/25')
  })
})

describe('matchOwnDraft (§5) — read-only recovery, never creation', () => {
  const key = { borrowerTin: '302222222', contractNumber: '12/25', contractDate: '01.12.2025', amountTiyin: 55232877n }
  /** The step-12 window: [savingAt − 2 min, savingAt + 5 min]; `now` is deliberately not part of it (review B3). */
  const window = { fromMs: SAVED_AT - 120_000n, toMs: SAVED_AT + 300_000n, unknownTime: 'exclude' } as const
  const rows = (...list: RawListRow[]) => list.map(parseListRow).flatMap((r) => (r ? [r] : []))

  it('finds the draft the app just saved', () => {
    expect(matchOwnDraft(rows(raw()), key, window)).toEqual({ kind: 'one', id: v1(SAVED_AT) })
  })

  it('ignores a deleted draft', () => {
    expect(matchOwnDraft(rows(raw({ statusClass: 'doc-status--red' })), key, window)).toEqual({ kind: 'none' })
  })

  it('needs every field to match exactly', () => {
    const others = [
      raw({ counterparty: 'GAMMA\n303333333' }),
      raw({ contract: '13/25 · 01.12.2025' }),
      raw({ contract: '12/25 · 02.12.2025' }),
      raw({ amount: '552 328,78' }),
    ]
    for (const row of others) expect(matchOwnDraft(rows(row), key, window), row.contract + row.amount).toEqual({ kind: 'none' })
  })

  it('does not take a draft saved outside the window — two months of equal interest stay apart', () => {
    // Same counterparty, same contract, same amount: only the moment tells September's draft from October's (review B3).
    const septemberDraft = raw({ href: `/documents/${v1(SAVED_AT - 30n * 86_400_000n)}/1` })
    expect(matchOwnDraft(rows(septemberDraft), key, window)).toEqual({ kind: 'none' })
    expect(matchOwnDraft(rows(raw({ href: `/documents/${v1(window.fromMs)}/1` })), key, window)).toMatchObject({ kind: 'one' })
    expect(matchOwnDraft(rows(raw({ href: `/documents/${v1(window.toMs)}/1` })), key, window)).toMatchObject({ kind: 'one' })
    expect(matchOwnDraft(rows(raw({ href: `/documents/${v1(window.toMs + 1n)}/1` })), key, window)).toEqual({ kind: 'none' })
    expect(matchOwnDraft(rows(raw({ href: `/documents/${v1(window.fromMs - 1n)}/1` })), key, window)).toEqual({ kind: 'none' })
  })

  it('reports every candidate when two rows match — the person decides', () => {
    const second = raw({ href: `/documents/${v1(SAVED_AT + 1_000n)}/1` })
    const result = matchOwnDraft(rows(raw(), second), key, window)
    expect(result).toEqual({ kind: 'many', ids: [v1(SAVED_AT), v1(SAVED_AT + 1_000n)] })
  })

  it('never claims a draft whose id carries no time (step 12 excludes it)', () => {
    const notV1 = raw({ href: `/documents/${v1(SAVED_AT, { version: 4n })}/1` })
    expect(matchOwnDraft(rows(notV1), key, window)).toEqual({ kind: 'none' })
  })

  it('counts a draft with no readable time as similar (step 0 includes it)', () => {
    // Step 0 asks "is there already something like this?" — there, an unreadable time must not clear the invoice.
    const open = { fromMs: monthStartMs('2026-10'), toMs: null, unknownTime: 'include' } as const
    const notV1 = raw({ href: `/documents/${v1(SAVED_AT, { version: 4n })}/1` })
    expect(matchOwnDraft(rows(notV1), key, open)).toMatchObject({ kind: 'one' })
  })

  it('an open-ended window takes everything from its start on', () => {
    const open = { fromMs: SAVED_AT, toMs: null, unknownTime: 'exclude' } as const
    expect(matchOwnDraft(rows(raw({ href: `/documents/${v1(SAVED_AT + 9_000_000_000n)}/1` })), key, open)).toMatchObject({ kind: 'one' })
    expect(matchOwnDraft(rows(raw({ href: `/documents/${v1(SAVED_AT - 1n)}/1` })), key, open)).toEqual({ kind: 'none' })
  })

  it('skips rows with an unreadable field rather than matching on the rest', () => {
    for (const row of [raw({ amount: 'ҚҚСсиз' }), raw({ contract: 'shartnomasiz' }), raw({ counterparty: 'BETA AGRO MCHJ' })]) {
      expect(matchOwnDraft(rows(row), key, window)).toEqual({ kind: 'none' })
    }
  })

  it('matches an invoice whose number Didox decorated (review finding 10)', () => {
    expect(matchOwnDraft(rows(raw({ contract: '№ 12/25 от 01.12.2025' })), key, window)).toEqual({ kind: 'one', id: v1(SAVED_AT) })
  })

  it('still refuses a different number after normalisation', () => {
    expect(matchOwnDraft(rows(raw({ contract: '№ 112/25 от 01.12.2025' })), key, window)).toEqual({ kind: 'none' })
  })

  it('finds nothing in an empty list', () => {
    expect(matchOwnDraft([], key, window)).toEqual({ kind: 'none' })
  })
})
