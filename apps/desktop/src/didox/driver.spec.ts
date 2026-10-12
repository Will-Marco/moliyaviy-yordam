import { describe, expect, it, vi } from 'vitest'
import { type ProgressEvent, StepError } from './contract.js'
import { humanPauseMs, step } from './driver.js'
import { FakePage } from './testing/fake-page.js'

const ctx = (signal = new AbortController().signal) => {
  const events: ProgressEvent[] = []
  return { events, ctx: { tin: '303471702', signal, onProgress: (e: ProgressEvent) => events.push(e) } }
}

describe('step', () => {
  it('reports running then done and returns the result', async () => {
    const page = new FakePage()
    const { events, ctx: c } = ctx()

    await expect(step('openLogin', page, c, async () => 42)).resolves.toBe(42)

    expect(events).toEqual([
      { firmTin: '303471702', step: 'openLogin', status: 'running' },
      { firmTin: '303471702', step: 'openLogin', status: 'done' },
    ])
    expect(page.of('screenshot')).toEqual([])
  })

  it('refuses to start once cancelled, without running the body', async () => {
    const ac = new AbortController()
    ac.abort()
    const body = vi.fn(async () => 1)
    const { events, ctx: c } = ctx(ac.signal)

    await expect(step('pickKey', new FakePage(), c, body)).rejects.toMatchObject({ code: 'CANCELLED', step: 'pickKey' })
    expect(body).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('keeps a StepError code, names the step and attaches a screenshot', async () => {
    const page = new FakePage()
    const { events, ctx: c } = ctx()

    const err = await step('verifyFirm', page, c, async () => {
      throw new StepError('WRONG_FIRM', 'boshqa firma')
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(StepError)
    expect(err).toMatchObject({ code: 'WRONG_FIRM', message: 'boshqa firma', step: 'verifyFirm', screenshot: '/diag/verifyFirm.png' })
    expect(page.of('screenshot')).toEqual([{ kind: 'screenshot', label: 'verifyFirm' }])
    expect(events.at(-1)).toEqual({ firmTin: '303471702', step: 'verifyFirm', status: 'failed', message: 'boshqa firma' })
  })

  it('wraps a foreign error as PAGE_UNEXPECTED', async () => {
    const err = await step('pickKey', new FakePage(), ctx().ctx, async () => {
      throw new TypeError('x is undefined')
    }).catch((e: unknown) => e)

    expect(err).toMatchObject({ code: 'PAGE_UNEXPECTED', step: 'pickKey' })
    expect((err as Error).message).toContain('x is undefined')
  })

  it('treats a failure after cancel as CANCELLED and takes no screenshot', async () => {
    const ac = new AbortController()
    const page = new FakePage()
    const err = await step('awaitLogin', page, ctx(ac.signal).ctx, async () => {
      ac.abort()
      throw new Error('navigation aborted')
    }).catch((e: unknown) => e)

    expect(err).toMatchObject({ code: 'CANCELLED', step: 'awaitLogin', screenshot: null })
    expect(page.of('screenshot')).toEqual([])
  })

  it('keeps a StepError code (e.g. WRONG_PASSWORD) even when the run was cancelled meanwhile', async () => {
    const ac = new AbortController()
    const err = await step('armAndEnter', new FakePage(), ctx(ac.signal).ctx, async () => {
      ac.abort()
      throw new StepError('WRONG_PASSWORD', 'rad etildi')
    }).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'WRONG_PASSWORD', step: 'armAndEnter' })
  })

  it('does not retry the body', async () => {
    const body = vi.fn(async () => {
      throw new StepError('TIMEOUT', 'kutildi')
    })
    await expect(step('openLogin', new FakePage(), ctx().ctx, body)).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(body).toHaveBeenCalledTimes(1)
  })

  it('still reports the real error when the screenshot fails', async () => {
    const page = new FakePage()
    page.screenshotFails = true
    const err = await step('openLogin', page, ctx().ctx, async () => {
      throw new StepError('TIMEOUT', 'kutildi')
    }).catch((e: unknown) => e)

    expect(err).toMatchObject({ code: 'TIMEOUT', screenshot: null })
  })

  it('ignores a throwing progress listener', async () => {
    const c = { tin: '303471702', signal: new AbortController().signal, onProgress: () => { throw new Error('ui gone') } }
    await expect(step('openLogin', new FakePage(), c, async () => 'ok')).resolves.toBe('ok')
  })
})

describe('humanPauseMs', () => {
  it('stays within 300–800 ms', () => {
    expect(humanPauseMs(() => 0)).toBe(300)
    expect(humanPauseMs(() => 0.999999)).toBe(800)
    expect(humanPauseMs(() => 0.5)).toBe(550)
    expect(humanPauseMs(() => Number.NaN)).toBe(300)
    for (let i = 0; i < 100; i++) {
      const ms = humanPauseMs()
      expect(ms).toBeGreaterThanOrEqual(300)
      expect(ms).toBeLessThanOrEqual(800)
    }
  })
})
