import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSkipStore } from './skips.js'

let file: string
let now = Date.parse('2026-10-13T06:00:00.000Z')

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), 'didox-skips-')), 'didox-skips.json')
  now = Date.parse('2026-10-13T06:00:00.000Z')
})

const store = () => createSkipStore({ file, nowMs: () => now })
const onDisk = async () => JSON.parse(await readFile(file, 'utf8'))

describe('createSkipStore (§2, Sir 2026-10-13)', () => {
  it('skips one invoice of one month, and says so', async () => {
    const skips = store()
    expect(await skips.isSkipped('2026-09', 'c1')).toBe(false)

    await skips.set('2026-09', 'c1')
    expect(await skips.isSkipped('2026-09', 'c1')).toBe(true)
    // The flag belongs to this month only: next month the invoice is `tayyor` again.
    expect(await skips.isSkipped('2026-10', 'c1')).toBe(false)
    expect(await skips.isSkipped('2026-09', 'c2')).toBe(false)
  })

  it('keys the file by month and contract, with when it was set', async () => {
    await store().set('2026-09', 'c1', "Didox'da qo'lda yaratilgan")
    expect(await onDisk()).toEqual({
      '2026-09/c1': { at: '2026-10-13T06:00:00.000Z', note: "Didox'da qo'lda yaratilgan" },
    })
  })

  it('leaves out the note when there is none', async () => {
    await store().set('2026-09', 'c1')
    expect(await onDisk()).toEqual({ '2026-09/c1': { at: '2026-10-13T06:00:00.000Z' } })
  })

  it('lists a month for the invoices page', async () => {
    const skips = store()
    await skips.set('2026-09', 'c1', 'keyinroq')
    await skips.set('2026-09', 'c2')
    await skips.set('2026-08', 'c3')

    expect(await skips.list('2026-09')).toEqual({
      c1: { at: '2026-10-13T06:00:00.000Z', note: 'keyinroq' },
      c2: { at: '2026-10-13T06:00:00.000Z' },
    })
    expect(await skips.list('2026-07')).toEqual({})
  })

  it('takes the flag off again', async () => {
    const skips = store()
    await skips.set('2026-09', 'c1')
    await skips.remove('2026-09', 'c1')

    expect(await skips.isSkipped('2026-09', 'c1')).toBe(false)
    expect(await onDisk()).toEqual({})
    // Removing what is not there is not an error.
    await skips.remove('2026-09', 'c1')
  })

  it('re-setting refreshes when and why', async () => {
    const skips = store()
    await skips.set('2026-09', 'c1', 'birinchi')
    now += 60_000
    await skips.set('2026-09', 'c1', 'ikkinchi')
    expect(await skips.list('2026-09')).toEqual({ c1: { at: '2026-10-13T06:01:00.000Z', note: 'ikkinchi' } })
  })

  it('survives a restart and writes for this user only', async () => {
    await store().set('2026-09', 'c1')
    expect(await store().isSkipped('2026-09', 'c1')).toBe(true)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })

  it('does not drop an entry when two flags are set at once', async () => {
    const skips = store()
    await Promise.all([skips.set('2026-09', 'c1'), skips.set('2026-09', 'c2'), skips.set('2026-08', 'c3')])
    expect(Object.keys(await onDisk()).sort()).toEqual(['2026-08/c3', '2026-09/c1', '2026-09/c2'])
  })

  it('starts empty when the file is damaged instead of failing the run', async () => {
    await writeFile(file, '{ not json')
    const skips = store()
    expect(await skips.list('2026-09')).toEqual({})
    await skips.set('2026-09', 'c1')
    expect(await onDisk()).toEqual({ '2026-09/c1': { at: '2026-10-13T06:00:00.000Z' } })
  })

  // Review finding 12: a flag the planner honours but the invoices page cannot see would be invisible to the accountant.
  it('refuses a month it could not read back', async () => {
    const skips = store()
    for (const bad of ['2026-1', '2026-13', '26-09', '', '2026-00']) {
      await expect(skips.set(bad, 'c1'), bad).rejects.toThrow(/oy/i)
      await expect(skips.isSkipped(bad, 'c1'), bad).rejects.toThrow(/oy/i)
      await expect(skips.remove(bad, 'c1'), bad).rejects.toThrow(/oy/i)
    }
    await expect(skips.set('2026-09', '')).rejects.toThrow(/ID/i)
  })

  it('ignores keys it did not write', async () => {
    await writeFile(file, JSON.stringify({ 'not-a-key': { at: 'x' }, '2026-09/c1': { at: 'y' }, '2026-09': {} }))
    expect(await store().list('2026-09')).toEqual({ c1: { at: 'y' } })
  })
})
