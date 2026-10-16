import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIDOX_DECIMAL_SEP, formatForDidox, parseDidoxMoney, tiyinOf } from './money.js'

describe('tiyinOf — the API amount is the only source (§1)', () => {
  it('reads the API format exactly', () => {
    expect(tiyinOf('0.01')).toBe(1n)
    expect(tiyinOf('1.00')).toBe(100n)
    expect(tiyinOf('552328.77')).toBe(55232877n)
    expect(tiyinOf('15904000000.10')).toBe(1590400000010n)
  })

  it('throws on anything that is not `digits.dd` — a silent reinterpretation would move money', () => {
    for (const bad of ['1', '1.0', '1.000', '1,00', ' 1.00', '1.00 ', '-1.00', '1e3.00', '', '1 000.00', '0x10.00']) {
      expect(() => tiyinOf(bad), bad).toThrow(/summa/i)
    }
  })
})

describe('parseDidoxMoney — what Didox shows back (§1)', () => {
  it('accepts both separators and thousand groups, plain or NBSP', () => {
    expect(parseDidoxMoney('0.01')).toBe(1n)
    expect(parseDidoxMoney('0.10')).toBe(10n)
    expect(parseDidoxMoney('1')).toBe(100n)
    expect(parseDidoxMoney('1.00')).toBe(100n)
    expect(parseDidoxMoney('1,5')).toBe(150n)
    expect(parseDidoxMoney('552328.77')).toBe(55232877n)
    expect(parseDidoxMoney('552 328,77')).toBe(55232877n)
    expect(parseDidoxMoney('552 328,77')).toBe(55232877n)
    expect(parseDidoxMoney('15 904 000 000.10')).toBe(1590400000010n)
    expect(parseDidoxMoney('  1.00 ')).toBe(100n)
  })

  it('returns null rather than truncating or guessing (fail-closed)', () => {
    for (const bad of ['552328.765', '1e3', '−1', '-1', '1.2.3', '1,00.00', 'ҚҚСсиз', '', ' ', '1 000 000,', '.5', '1..0']) {
      expect(parseDidoxMoney(bad), bad).toBeNull()
    }
  })
})

describe('formatForDidox — BigInt to text, no floats (§1)', () => {
  it('writes the amount with the separator the form expects', () => {
    expect(formatForDidox(1n, '.')).toBe('0.01')
    expect(formatForDidox(10n, '.')).toBe('0.10')
    expect(formatForDidox(100n, '.')).toBe('1.00')
    expect(formatForDidox(55232877n, '.')).toBe('552328.77')
    expect(formatForDidox(55232877n, ',')).toBe('552328,77')
    // 15 904 000 000.10 exceeds 2^53 tiyin handling in floats; BigInt keeps the kopeck.
    expect(formatForDidox(1590400000010n, '.')).toBe('15904000000.10')
    expect(formatForDidox(999999999999999999n, '.')).toBe('9999999999999999.99')
  })

  it('refuses a negative amount', () => {
    expect(() => formatForDidox(-1n, '.')).toThrow(/summa/i)
  })

  it('defaults to the dot until the spike says otherwise (S2)', () => {
    expect(DIDOX_DECIMAL_SEP).toBe('.')
  })

  it('round-trips every amount the app can meet', () => {
    for (const amount of ['0.01', '1.00', '1.50', '552328.77', '15904000000.10']) {
      expect(parseDidoxMoney(formatForDidox(tiyinOf(amount), DIDOX_DECIMAL_SEP))).toBe(tiyinOf(amount))
    }
  })
})

/*
 * CONSTITUTION §7: money never passes through a float. This guard is why `src/didox` and `src/api` can be trusted —
 * one `Number(value)` on an amount would round 15 904 000 000.10 and nobody would see it.
 */
describe('no float parsing in the Didox and API layers', () => {
  // autotype/ drives E-IMZO's own window and holds a JXA script (a string run by osascript); no money there.
  // Compared with '/' separators so the exclusion also holds on Windows, where walk() returns `src\didox\…`.
  const files = [...walk('src/didox'), ...walk('src/api')].filter(
    (f) => !f.split(sep).join('/').includes('/autotype/') && !f.endsWith('.spec.ts'),
  )

  it('scans a plausible set of files', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  it.each(files)('%s has no Number()/parseFloat()/parseInt()', (file) => {
    const offenders = readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, at: i + 1 }))
      .filter(({ line }) => /\b(Number|parseFloat|parseInt)\s*\(/.test(line))
      .map(({ line, at }) => `${file}:${at} ${line.trim()}`)
    expect(offenders).toEqual([])
  })
})

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}
