import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  charDelay,
  type ClickProbe,
  clickScript,
  pointerClick,
  pollScript,
  readScript,
  screenshotName,
  staleScreenshots,
  valueScript,
} from './page-scripts.js'

/** A minimal element as the page script sees it. */
function element(text: string, attrs: Record<string, string> = {}) {
  const el = {
    innerText: text,
    textContent: text,
    getAttribute: (name: string) => attrs[name] ?? null,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 40 }),
    scrollIntoView: vi.fn(),
    click: vi.fn(),
    contains: (other: unknown) => other === el,
  }
  return el
}

/** Runs a page script the way executeJavaScript would, with `globalThis.__el` as the located element. */
function run<T>(script: string, el: unknown, hit: unknown = el): T {
  vi.stubGlobal('__el', el)
  vi.stubGlobal('document', { elementFromPoint: () => hit, activeElement: null })
  return (0, eval)(script) as T
}

afterEach(() => vi.unstubAllGlobals())

describe('clickScript', () => {
  it('clicks an ordinary button', () => {
    const el = element('Кириш')
    const probe = run<ClickProbe>(clickScript('globalThis.__el', false), el)
    expect(probe).toMatchObject({ found: true, forbidden: false, clicked: true })
    expect(el.click).toHaveBeenCalledOnce()
  })

  it.each(['Имзолаш', 'Юбориш', 'Подписать', 'Отправить', 'Imzolash', 'Yuborish'])('refuses a "%s" button without clicking', (text) => {
    const el = element(`  ${text} `)
    const probe = run<ClickProbe>(clickScript('globalThis.__el', false), el)
    expect(probe).toMatchObject({ found: true, forbidden: true, clicked: false })
    expect(el.click).not.toHaveBeenCalled()
  })

  it('reads the aria-label and title too', () => {
    const el = element('', { 'aria-label': 'Hujjatni imzolash' })
    expect(run<ClickProbe>(clickScript('globalThis.__el', false), el)).toMatchObject({ forbidden: true })
    expect(el.click).not.toHaveBeenCalled()
  })

  it('for a pointer click only reports the centre and never clicks itself', () => {
    const el = element('Хизмат кўрсатиш')
    const probe = run<ClickProbe>(clickScript('globalThis.__el', true), el)
    expect(probe).toMatchObject({ found: true, forbidden: false, clicked: false, x: 60, y: 40, covered: false })
    expect(el.click).not.toHaveBeenCalled()
  })

  it('refuses a pointer click that would land on a sign button lying over the target', () => {
    const el = element('Хизмат кўрсатиш')
    const overlay = element('Imzolash')
    expect(run<ClickProbe>(clickScript('globalThis.__el', true), el, overlay)).toMatchObject({ forbidden: true, covered: true })
  })

  it('says when the element is not there', () => {
    expect(run<ClickProbe>(clickScript('globalThis.__el', false), null)).toEqual({ found: false })
  })
})

describe('readScript / pollScript', () => {
  it('returns a JSON copy of the value', () => {
    expect(run(readScript('({ inn: "303471702", n: 1 })'), null)).toEqual({ inn: '303471702', n: 1 })
    expect(run(readScript('undefined'), null)).toBeNull()
  })

  it('read lets a failing snippet throw; poll treats it as "not yet"', () => {
    expect(() => run(readScript('globalThis.__el.missing.x'), null)).toThrow()
    expect(run(pollScript('globalThis.__el.missing.x'), null)).toBeNull()
  })
})

describe('helpers', () => {
  it('types with 40–80 ms pauses', () => {
    expect(charDelay(() => 0)).toBe(40)
    expect(charDelay(() => 0.9999)).toBe(80)
  })

  it('names screenshots by time with a safe label', () => {
    expect(screenshotName('login / failed: КИРИШ', new Date('2026-10-12T09:30:01.123Z'))).toBe('2026-10-12T09-30-01-123Z-login-failed.png')
    expect(screenshotName('///', new Date('2026-10-12T09:30:01.123Z'))).toBe('2026-10-12T09-30-01-123Z-shot.png')
  })

  it('keeps only the newest screenshots', () => {
    const names = ['2026-10-12T09-00-03-000Z-c.png', '2026-10-12T09-00-01-000Z-a.png', 'notes.txt', '2026-10-12T09-00-02-000Z-b.png']
    expect(staleScreenshots(names, 2)).toEqual(['2026-10-12T09-00-01-000Z-a.png'])
    expect(staleScreenshots(names, 20)).toEqual([])
  })
})

describe('pointerClick', () => {
  const at = (x: number, label = 'Хизмат кўрсатиш', extra: Partial<ClickProbe> = {}): ClickProbe =>
    ({ found: true, forbidden: false, label, clicked: false, x, y: 40, covered: false, ...extra }) as ClickProbe
  const io = (probes: ClickProbe[]) => {
    const queue = [...probes]
    return {
      probe: vi.fn(async () => queue.shift() ?? probes.at(-1)!),
      press: vi.fn(),
      release: vi.fn(),
      sleep: vi.fn(async () => undefined),
    }
  }

  it('waits for the element to stop moving, then presses and releases on it', async () => {
    const d = io([at(10), at(30), at(60), at(60), at(60)])
    expect(await pointerClick(d)).toMatchObject({ outcome: 'clicked' })
    expect(d.press).toHaveBeenCalledExactlyOnceWith(60, 40)
    expect(d.release).toHaveBeenCalledExactlyOnceWith(60, 40)
  })

  it('never releases when a sign label shows up after pressing', async () => {
    const d = io([at(60), at(60), at(60, 'Imzolash', { forbidden: true })])
    expect(await pointerClick(d)).toMatchObject({ outcome: 'forbidden', label: 'Imzolash' })
    expect(d.press).toHaveBeenCalledOnce()
    expect(d.release).not.toHaveBeenCalled()
  })

  it('never releases when the element moved under the pressed pointer', async () => {
    const d = io([at(60), at(60), at(90)])
    expect(await pointerClick(d)).toMatchObject({ outcome: 'moved' })
    expect(d.release).not.toHaveBeenCalled()
  })

  it('does not press a forbidden, covered or missing element', async () => {
    for (const first of [at(60, 'Yuborish', { forbidden: true }), at(60, 'x', { covered: true }), { found: false } as ClickProbe]) {
      const d = io([first])
      expect((await pointerClick(d)).outcome).not.toBe('clicked')
      expect(d.press).not.toHaveBeenCalled()
    }
  })

  it('gives up on an element that never settles', async () => {
    let x = 0
    const d = { ...io([]), probe: vi.fn(async () => at((x += 10))) }
    expect(await pointerClick({ ...d, settleTries: 3 })).toMatchObject({ outcome: 'unstable' })
    expect(d.press).not.toHaveBeenCalled()
  })
})

describe('valueScript (M8c §9)', () => {
  it('reads what the field holds, collapsed like a person reads it', () => {
    expect(run<string>(valueScript('globalThis.__el'), { value: ' 552 328,77 ' })).toBe('552 328,77')
    expect(run<string>(valueScript('globalThis.__el'), { textContent: 'Ҳисоб-фактура\n актсиз ' })).toBe('Ҳисоб-фактура актсиз')
    expect(run<string>(valueScript('globalThis.__el'), { value: '' })).toBe('')
  })

  it('is null when the element is not there — the caller decides what that means', () => {
    expect(run<string | null>(valueScript('globalThis.__el'), null)).toBeNull()
  })

  it('prefers value over text, so a filled input is never read as its placeholder markup', () => {
    expect(run<string>(valueScript('globalThis.__el'), { value: '1', textContent: 'Сони' })).toBe('1')
  })
})

