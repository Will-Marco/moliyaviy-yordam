import { describe, expect, it, vi } from 'vitest'
import { CANCELLED, checkLoginPrompt, confirmed, draftsPrompt, guardConfirm } from './confirm.js'

describe('confirmed — the robot starts only on a yes given in the app itself (CONSTITUTION §13)', () => {
  it('starts the work when the person says Boshlash', async () => {
    const start = vi.fn(async () => ({ ok: true as const, runId: 'r1' }))

    expect(await confirmed(async () => true, draftsPrompt('2026-09', 'all'), start)).toEqual({ ok: true, runId: 'r1' })
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('starts nothing and answers CANCELLED otherwise', async () => {
    const start = vi.fn(async () => ({ ok: true as const }))

    expect(await confirmed(async () => false, checkLoginPrompt('300000001', null), start)).toEqual(CANCELLED)
    expect(start).not.toHaveBeenCalled()
    expect(CANCELLED).toEqual({ ok: false, code: 'CANCELLED', message: expect.stringContaining('Bekor qilindi') })
  })

  it('starts nothing when the dialog itself fails', async () => {
    const start = vi.fn(async () => ({ ok: true as const }))
    const broken = async (): Promise<boolean> => {
      throw new Error('window destroyed')
    }

    expect(await confirmed(broken, draftsPrompt('2026-09', 'all'), start)).toEqual(CANCELLED)
    expect(start).not.toHaveBeenCalled()
  })
})

describe('what the confirmation says', () => {
  it('names the month and the firms of a draft run', () => {
    expect(draftsPrompt('2026-09', 'all')).toMatchObject({
      message: "Didox'da Sentabr 2026 uchun qoralamalar yaratish boshlansinmi?",
      detail: expect.stringContaining('barcha beruvchi firmalar'),
    })
    expect(
      draftsPrompt('2026-01', [
        { tin: '300000001', name: 'ALFA SAVDO MCHJ' },
        { tin: '300000002', name: null },
      ]).detail,
    ).toContain('Firmalar: ALFA SAVDO MCHJ (STIR 300000001), STIR 300000002.')
    expect(draftsPrompt('2026-12', 3)).toMatchObject({ message: expect.stringContaining('Dekabr 2026'), detail: expect.stringContaining('3 ta firma') })
  })

  it('says nothing is signed or sent', () => {
    expect(draftsPrompt('2026-09', 'all').detail).toMatch(/imzolanmaydi/)
  })

  it('names the firm of a login check by STIR, and by name when E-IMZO knows it', () => {
    expect(checkLoginPrompt('300000001', null)).toMatchObject({
      message: "Didox'ga kirishni tekshirish boshlansinmi?",
      detail: expect.stringContaining('STIR 300000001'),
    })
    expect(checkLoginPrompt('300000001', 'ALFA SAVDO MCHJ').detail).toContain('ALFA SAVDO MCHJ (STIR 300000001)')
  })
})

describe('names in a confirmation cannot reshape it (security review H1)', () => {
  it('strips control characters, line breaks and bidi overrides from a name', () => {
    const detail = draftsPrompt('2026-09', [{ tin: '300000001', name: 'ALFA\n\nHech narsa‮ qilinmaydi\u0007' }]).detail

    expect(detail).toContain('Firmalar: ALFA Hech narsa qilinmaydi (STIR 300000001).')
    expect(checkLoginPrompt('300000001', 'ALFA\r\nBETA').detail).toContain('ALFA BETA (STIR 300000001)')
  })

  it('caps a long name', () => {
    const detail = draftsPrompt('2026-09', [{ tin: '300000001', name: 'A'.repeat(500) }]).detail

    expect(detail).toContain(`${'A'.repeat(59)}… (STIR 300000001)`)
    expect(detail).not.toContain('A'.repeat(60))
  })

  it('shows a name that is nothing but control characters as the STIR alone', () => {
    expect(checkLoginPrompt('300000001', '\u0000\n').detail).toContain('Firma: STIR 300000001.')
  })

  it('lists ten firms, then counts the rest', () => {
    const firms = Array.from({ length: 13 }, (_, i) => ({ tin: String(300000001 + i), name: null }))
    const detail = draftsPrompt('2026-09', firms).detail

    expect(detail).toContain('STIR 300000010, +3 ta.')
    expect(detail).not.toContain('300000011')
  })
})

describe('guardConfirm — one dialog at a time, no yes under a double-click (security review M3b)', () => {
  const request = draftsPrompt('2026-09', 'all')

  it('passes a considered answer through', async () => {
    let now = 0
    const confirm = guardConfirm(async () => ((now += 2_000), true), () => now)

    expect(await confirm(request)).toBe(true)
  })

  it('treats a yes that came faster than 600 ms as a no', async () => {
    let now = 0
    const confirm = guardConfirm(async () => ((now += 599), true), () => now)

    expect(await confirm(request)).toBe(false)
  })

  it('answers no at once while another confirmation is open, without showing a second one', async () => {
    let now = 0
    let answer!: (yes: boolean) => void
    const show = vi.fn(() => new Promise<boolean>((ok) => (answer = ok)))
    const confirm = guardConfirm(show, () => now)

    const first = confirm(request)
    expect(await confirm(request)).toBe(false)
    expect(show).toHaveBeenCalledTimes(1)

    now += 1_000
    answer(true)
    expect(await first).toBe(true)
  })

  it('shows the next one once the first is answered, even when the first dialog failed', async () => {
    let now = 0
    const show = vi
      .fn<(request: unknown) => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('window destroyed'))
      .mockImplementation(async () => ((now += 1_000), true))
    const confirm = guardConfirm(show, () => now)

    await expect(confirm(request)).rejects.toThrow('window destroyed')
    expect(await confirm(request)).toBe(true)
  })
})
