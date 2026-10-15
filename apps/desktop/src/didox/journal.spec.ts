import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlagWriteResult, MarkDraftBody, MarkDraftResult } from '../api/client.js'
import { createJournal, type FlagSink, type InvoiceEntry, type RunJournal } from './journal.js'

let dir: string
let now = Date.parse('2026-10-13T06:00:00.000Z')
const clock = () => now

const journal = () => createJournal({ dir, nowMs: clock, randomHex: () => 'a1b2' })

const firm = (tin: string, invoices: Partial<InvoiceEntry>[] = [{}]) => ({
  tin,
  name: `FIRMA ${tin}`,
  invoices: invoices.map((over, i) => ({
    contractId: `c${i + 1}`,
    contractNumber: `1${i}/25`,
    contractSignedOn: '2025-12-01',
    borrowerTin: '302222222',
    borrowerName: 'BETA MCHJ',
    lineName: 'Берилган молиявий ёрдам…',
    amount: '552328.77',
    ...over,
  })),
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'didox-runs-'))
  now = Date.parse('2026-10-13T06:00:00.000Z')
})

afterEach(() => {
  now = Date.parse('2026-10-13T06:00:00.000Z')
})

const read = async (runId: string): Promise<RunJournal> => JSON.parse(await readFile(join(dir, `${runId}.json`), 'utf8'))

describe('createJournal — the run is on disk, not in memory (§2)', () => {
  it('names a run so files sort by time and writes it before anything else happens', async () => {
    const run = await journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })

    expect(run.runId).toBe('2026-10-13T06-00-00.000Z-a1b2')
    const saved = await read(run.runId)
    expect(saved).toMatchObject({
      runId: run.runId,
      month: '2026-09',
      trigger: 'manual',
      startedAt: '2026-10-13T06:00:00.000Z',
      status: 'running',
    })
    expect(saved.firms[0]).toMatchObject({ tin: '301111111', status: 'pending' })
    expect(saved.firms[0]!.invoices[0]).toMatchObject({ contractId: 'c1', state: 'pending', amount: '552328.77' })
  })

  // Windows has no POSIX mode bits (Node reports them made up); there the file sits under the user's own profile, whose ACL keeps it theirs.
  it.skipIf(process.platform === 'win32')('writes the file for this user only', async () => {
    const run = await journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    expect((await stat(join(dir, `${run.runId}.json`))).mode & 0o777).toBe(0o600)
  })

  it('leaves no temporary file behind', async () => {
    const run = await journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await run.setInvoice('301111111', 'c1', { state: 'saving', savingAt: '2026-10-13T06:00:05.000Z' })
    expect((await readdir(dir)).filter((f) => !f.endsWith('.json'))).toEqual([])
  })

  it('persists every state change as it happens — a crash leaves the last known state', async () => {
    const run = await journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await run.setFirm('301111111', { status: 'login' })
    await run.setFirm('301111111', { status: 'running' })
    await run.setInvoice('301111111', 'c1', { state: 'saving', savingAt: '2026-10-13T06:00:05.000Z' })

    const saved = await read(run.runId)
    expect(saved.firms[0]!.status).toBe('running')
    expect(saved.firms[0]!.invoices[0]).toMatchObject({ state: 'saving', savingAt: '2026-10-13T06:00:05.000Z' })
  })

  it('keeps a short step history for the live log', async () => {
    const run = await journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await run.addStep('301111111', 'c1', { step: 'openForm', status: 'done' })
    await run.addStep('301111111', 'c1', { step: 'save', status: 'failed' })

    expect((await read(run.runId)).firms[0]!.invoices[0]!.steps).toEqual([
      { step: 'openForm', status: 'done', at: '2026-10-13T06:00:00.000Z' },
      { step: 'save', status: 'failed', at: '2026-10-13T06:00:00.000Z' },
    ])
  })

  it('finishes the run with a status', async () => {
    const run = await journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    now += 60_000
    await run.finish('done')

    expect(await read(run.runId)).toMatchObject({ status: 'done', finishedAt: '2026-10-13T06:01:00.000Z' })
  })

  it('records why a run failed', async () => {
    const run = await journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await run.finish('failed', { code: 'STALLED', message: 'Didox javob bermadi' })
    expect((await read(run.runId)).failure).toEqual({ code: 'STALLED', message: 'Didox javob bermadi' })
  })

  it('refuses to write about a firm or invoice that is not in the run', async () => {
    const run = await journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await expect(run.setFirm('309999999', { status: 'done' })).rejects.toThrow(/309999999/)
    await expect(run.setInvoice('301111111', 'c9', { state: 'marked' })).rejects.toThrow(/c9/)
  })
})

describe('the invoice state machine (§2)', () => {
  const start = () => journal().start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })

  it('walks the happy path pending → saving → id_found → marked', async () => {
    const run = await start()
    await run.setInvoice('301111111', 'c1', { state: 'saving', savingAt: '2026-10-13T06:00:05.000Z' })
    await run.setInvoice('301111111', 'c1', { state: 'id_found', didoxId: 'A1B2C3D4E5F60718293A4B5C6D7E8F90' })
    await run.setInvoice('301111111', 'c1', { state: 'marked' })

    expect((await read(run.runId)).firms[0]!.invoices[0]).toMatchObject({
      state: 'marked',
      didoxId: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
      savingAt: '2026-10-13T06:00:05.000Z',
    })
  })

  it('allows needs_check and error from any step', async () => {
    for (const path of [
      ['needs_check'],
      ['error'],
      ['saving', 'needs_check'],
      ['saving', 'error'],
      ['saving', 'id_found', 'needs_check'],
    ] as const) {
      now += 1000
      const run = await start()
      for (const state of path) await run.setInvoice('301111111', 'c1', { state })
      expect((await read(run.runId)).firms[0]!.invoices[0]!.state).toBe(path.at(-1))
    }
  })

  it('lets recovery lift a needs_check invoice back to id_found, then marked', async () => {
    const run = await start()
    await run.setInvoice('301111111', 'c1', { state: 'needs_check', code: 'SAVED_ID_UNKNOWN' })
    await run.setInvoice('301111111', 'c1', { state: 'needs_check', message: 'qayta tekshirildi' })
    await run.setInvoice('301111111', 'c1', { state: 'id_found', didoxId: 'A1B2C3D4E5F60718293A4B5C6D7E8F90' })
    await run.setInvoice('301111111', 'c1', { state: 'marked' })
    expect((await read(run.runId)).firms[0]!.invoices[0]!.state).toBe('marked')
  })

  it('refuses a transition that would lose what Didox already holds', async () => {
    const run = await start()
    await expect(run.setInvoice('301111111', 'c1', { state: 'id_found' })).rejects.toThrow(/pending.*id_found/)
    await run.setInvoice('301111111', 'c1', { state: 'saving' })
    await expect(run.setInvoice('301111111', 'c1', { state: 'skipped' })).rejects.toThrow(/saving.*skipped/)
    await run.setInvoice('301111111', 'c1', { state: 'id_found' })
    await run.setInvoice('301111111', 'c1', { state: 'marked' })
    // Marked is the end: the API holds the ID, nothing in a run may move it back.
    await expect(run.setInvoice('301111111', 'c1', { state: 'saving' })).rejects.toThrow(/marked.*saving/)
  })

  it('refuses to reopen a skipped or failed invoice', async () => {
    const run = await start()
    await run.setInvoice('301111111', 'c1', { state: 'skipped', code: 'SKIPPED_BY_USER' })
    await expect(run.setInvoice('301111111', 'c1', { state: 'saving' })).rejects.toThrow(/skipped.*saving/)
  })
})

describe('listing and reading runs', () => {
  it('summarises the newest runs first, with counts', async () => {
    const j = journal()
    const first = await j.start({ month: '2026-08', trigger: 'manual', firms: [firm('301111111')] })
    await first.setInvoice('301111111', 'c1', { state: 'saving' })
    await first.setInvoice('301111111', 'c1', { state: 'id_found', didoxId: 'A'.repeat(32) })
    await first.setInvoice('301111111', 'c1', { state: 'marked' })
    await first.finish('done')
    now += 3_600_000
    const second = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111', [{}, {}])] })
    await second.setInvoice('301111111', 'c2', { state: 'skipped', code: 'SKIPPED_BY_USER' })
    await second.finish('cancelled')

    const runs = await j.list()
    expect(runs.map((r) => r.month)).toEqual(['2026-09', '2026-08'])
    expect(runs[0]).toMatchObject({ status: 'cancelled', counts: { marked: 0, skipped: 1, needsCheck: 0, error: 0, pending: 1 } })
    expect(runs[1]).toMatchObject({ status: 'done', counts: { marked: 1, skipped: 0, needsCheck: 0, error: 0, pending: 0 } })
  })

  it('limits the listing and can filter by month', async () => {
    const j = journal()
    for (const month of ['2026-07', '2026-08', '2026-09']) {
      now += 1000
      await (await j.start({ month, trigger: 'manual', firms: [firm('301111111')] })).finish('done')
    }
    expect(await j.list({ limit: 2 })).toHaveLength(2)
    expect((await j.list({ month: '2026-08' })).map((r) => r.month)).toEqual(['2026-08'])
  })

  it('reads one run back, and nothing for an unknown id', async () => {
    const j = journal()
    const run = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    expect((await j.read(run.runId))?.month).toBe('2026-09')
    expect(await j.read('2026-01-01T00-00-00.000Z-ffff')).toBeNull()
    // A traversal attempt must not reach outside the directory.
    expect(await j.read('../../etc/passwd')).toBeNull()
  })

  it('ignores a damaged file instead of failing the listing', async () => {
    const j = journal()
    await (await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })).finish('done')
    await writeFile(join(dir, '2026-10-13T07-00-00.000Z-dead.json'), '{ not json')
    expect(await j.list()).toHaveLength(1)
  })
})

describe('rotation — 50 runs, but never one that still needs a person (§2)', () => {
  it('keeps the 50 newest and drops older ones', async () => {
    const j = journal()
    for (let i = 0; i < 55; i++) {
      now += 1000
      await (await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })).finish('done')
    }
    await j.rotate()

    const files = (await readdir(dir)).sort()
    expect(files).toHaveLength(50)
    expect(files[0]).toBe('2026-10-13T06-00-06.000Z-a1b2.json') // the 6th run: the first five are gone
  })

  it('keeps an old run whose invoice still needs checking or marking', async () => {
    const j = journal()
    const needsCheck = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await needsCheck.setInvoice('301111111', 'c1', { state: 'needs_check', code: 'SAVED_ID_UNKNOWN' })
    await needsCheck.finish('done')
    now += 1000
    const idFound = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await idFound.setInvoice('301111111', 'c1', { state: 'saving' })
    await idFound.setInvoice('301111111', 'c1', { state: 'id_found', didoxId: 'A'.repeat(32) })
    await idFound.finish('done')
    for (let i = 0; i < 55; i++) {
      now += 1000
      await (await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })).finish('done')
    }
    await j.rotate()

    const kept = await readdir(dir)
    expect(kept).toContain(`${needsCheck.runId}.json`)
    expect(kept).toContain(`${idFound.runId}.json`)
    expect(kept).toHaveLength(52)
  })

  // Review finding 11: an unparsable file used to be invisible to rotation and stayed for ever.
  it('drops a damaged old file instead of keeping it for ever', async () => {
    const j = journal()
    await writeFile(join(dir, '2026-01-01T00-00-00.000Z-dead.json'), '{ not json')
    for (let i = 0; i < 55; i++) {
      now += 1000
      await (await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })).finish('done')
    }
    await j.rotate()

    const files = await readdir(dir)
    expect(files).not.toContain('2026-01-01T00-00-00.000Z-dead.json')
    expect(files).toHaveLength(50)
  })
})

describe('recoverStaleRuns — what the app finds after a crash (§2, §3)', () => {
  it('closes a run left running and sorts out its invoices', async () => {
    const j = journal()
    const run = await j.start({
      month: '2026-09',
      trigger: 'manual',
      firms: [firm('301111111', [{ contractId: 'c1' }, { contractId: 'c2' }, { contractId: 'c3' }, { contractId: 'c4' }])],
    })
    await run.setFirm('301111111', { status: 'running' })
    await run.setInvoice('301111111', 'c1', { state: 'saving', savingAt: '2026-10-13T06:00:05.000Z' })
    await run.setInvoice('301111111', 'c2', { state: 'saving' })
    await run.setInvoice('301111111', 'c2', { state: 'id_found', didoxId: 'A'.repeat(32) })
    await run.setInvoice('301111111', 'c3', { state: 'saving' })
    await run.setInvoice('301111111', 'c3', { state: 'id_found', didoxId: 'C'.repeat(32) })
    await run.setInvoice('301111111', 'c3', { state: 'marked' })
    // c4 stays pending — the app never got to it.

    now += 7_200_000
    const recovered = await createJournal({ dir, nowMs: clock, randomHex: () => 'c3d4' }).recoverStaleRuns()
    expect(recovered).toEqual([run.runId])

    const saved = await read(run.runId)
    expect(saved).toMatchObject({ status: 'failed', failure: { code: 'APP_CLOSED' }, finishedAt: '2026-10-13T08:00:00.000Z' })
    const byId = Object.fromEntries(saved.firms[0]!.invoices.map((i) => [i.contractId, i]))
    // Saving was interrupted: Didox may hold a draft, so a person looks (never an automatic retry).
    expect(byId.c1).toMatchObject({ state: 'needs_check', code: 'INTERRUPTED_SAVE' })
    // The ID is already on disk; flushIdFound marks it.
    expect(byId.c2).toMatchObject({ state: 'id_found', didoxId: 'A'.repeat(32) })
    expect(byId.c3).toMatchObject({ state: 'marked' })
    expect(byId.c4).toMatchObject({ state: 'skipped', code: 'APP_CLOSED' })
    expect(saved.firms[0]!.status).toBe('failed')
  })

  it('leaves finished runs alone', async () => {
    const j = journal()
    const done = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await done.setInvoice('301111111', 'c1', { state: 'skipped', code: 'SKIPPED_BY_USER' })
    await done.finish('done')
    const before = await read(done.runId)

    expect(await j.recoverStaleRuns()).toEqual([])
    expect(await read(done.runId)).toEqual(before)
  })
})

describe('flushIdFound — an ID on disk always reaches the API (§2, §3)', () => {
  const idFoundRun = async () => {
    now += 1000
    const j = journal()
    const run = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await run.setInvoice('301111111', 'c1', { state: 'saving', savingAt: '2026-10-13T06:00:05.000Z' })
    await run.setInvoice('301111111', 'c1', { state: 'id_found', didoxId: 'A1B2C3D4E5F60718293A4B5C6D7E8F90' })
    await run.finish('failed', { code: 'APP_CLOSED', message: 'ilova yopildi' })
    return { j, runId: run.runId }
  }

  const api = (...results: MarkDraftResult[]) => {
    const calls: { month: string; contractId: string; mark: MarkDraftBody }[] = []
    return {
      calls,
      markDraft: async (month: string, contractId: string, mark: MarkDraftBody) => {
        calls.push({ month, contractId, mark })
        return results.shift() ?? { ok: false as const, status: 0, code: 'NETWORK', message: 'no result queued' }
      },
    }
  }

  it('marks the invoice with the ID and the amount it put into Didox', async () => {
    const { j, runId } = await idFoundRun()
    const client = api({ ok: true, row: {} as never })
    expect(await j.flushIdFound(client)).toMatchObject({ marked: 1, needsCheck: 0, left: 0 })

    expect(client.calls).toEqual([
      {
        month: '2026-09',
        contractId: 'c1',
        mark: { didoxDocumentId: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', expectedAmount: '552328.77' },
      },
    ])
    expect((await read(runId)).firms[0]!.invoices[0]!.state).toBe('marked')
  })

  it('turns a 409 into needs_check and keeps the ID visible', async () => {
    for (const [answer, code] of [
      [{ ok: false as const, status: 409, code: 'AMOUNT_CHANGED', message: "Summa o'zgargan" }, 'AMOUNT_CHANGED'],
      [{ ok: false as const, status: 409, code: 'DRAFT_CHANGED', message: "O'zgardi" }, 'DRAFT_CHANGED'],
      [
        {
          ok: false as const,
          status: 409,
          code: 'CONFIRMATION_REQUIRED',
          message: 'Tasdiq kerak',
          warnings: [{ code: 'POSSIBLE_DUPLICATE', message: 'Ikkita qoralama' }],
        },
        'POSSIBLE_DUPLICATE',
      ],
      [{ ok: false as const, status: 400, message: "Bu oy uchun foiz yo'q" }, 'API_REJECTED'],
    ] as const) {
      const { j, runId } = await idFoundRun()
      expect(await j.flushIdFound(api(answer))).toMatchObject({ marked: 0, needsCheck: 1 })
      expect((await read(runId)).firms[0]!.invoices[0]).toMatchObject({
        state: 'needs_check',
        code,
        didoxId: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
      })
    }
  })

  // A fresh directory per case: an invoice left id_found stays waiting and would be counted again.
  it.each([
    { ok: false as const, status: 0, code: 'NETWORK', message: 'javob bermadi' },
    { ok: false as const, status: 503, message: 'Service unavailable' },
  ])('leaves the invoice id_found when the API answers $status — the next run tries again', async (answer) => {
    const { j, runId } = await idFoundRun()
    expect(await j.flushIdFound(api(answer))).toMatchObject({ marked: 0, needsCheck: 0, left: 1 })
    expect((await read(runId)).firms[0]!.invoices[0]!.state).toBe('id_found')
  })

  it('stops at the first 401 and reports it — the session is the problem, not the invoice', async () => {
    const { j, runId } = await idFoundRun()
    const client = api({ ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Sessiya tugagan' })
    expect(await j.flushIdFound(client)).toMatchObject({ unauthorized: true, left: 1 })
    expect((await read(runId)).firms[0]!.invoices[0]!.state).toBe('id_found')
  })

  it('does nothing when no invoice is waiting', async () => {
    const j = journal()
    const client = api()
    expect(await j.flushIdFound(client)).toMatchObject({ marked: 0, needsCheck: 0, left: 0 })
    expect(client.calls).toEqual([])
  })

  it('flushes across runs, oldest first', async () => {
    const first = await idFoundRun()
    now += 1000
    const second = await idFoundRun()
    const client = api({ ok: true, row: {} as never }, { ok: true, row: {} as never })
    expect(await second.j.flushIdFound(client)).toMatchObject({ marked: 2 })
    expect((await read(first.runId)).firms[0]!.invoices[0]!.state).toBe('marked')
    expect((await read(second.runId)).firms[0]!.invoices[0]!.state).toBe('marked')
  })

  it('skips an id_found entry with no ID instead of calling the API with nothing', async () => {
    const j = journal()
    const run = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('301111111')] })
    await run.setInvoice('301111111', 'c1', { state: 'saving' })
    await run.setInvoice('301111111', 'c1', { state: 'id_found' })
    await run.finish('failed', { code: 'APP_CLOSED', message: 'ilova yopildi' })
    const client = api()
    expect(await j.flushIdFound(client)).toMatchObject({ marked: 0, needsCheck: 1, left: 0 })
    expect(client.calls).toEqual([])
    expect((await read(run.runId)).firms[0]!.invoices[0]).toMatchObject({ state: 'needs_check', code: 'SAVED_ID_UNKNOWN' })
  })
})

describe('findNeedsCheck — what the next run may recover (§3.4)', () => {
  it('returns this month\'s interrupted saves that have no ID yet', async () => {
    const j = journal()
    const run = await j.start({
      month: '2026-09',
      trigger: 'manual',
      firms: [firm('301111111', [{ contractId: 'c1' }, { contractId: 'c2' }, { contractId: 'c3' }])],
    })
    await run.setInvoice('301111111', 'c1', { state: 'saving', savingAt: '2026-10-13T06:00:05.000Z' })
    await run.setInvoice('301111111', 'c1', { state: 'needs_check', code: 'INTERRUPTED_SAVE' })
    // c2: needs_check with an ID — nothing to look up any more.
    await run.setInvoice('301111111', 'c2', { state: 'saving', savingAt: '2026-10-13T06:00:06.000Z' })
    await run.setInvoice('301111111', 'c2', { state: 'needs_check', code: 'AMOUNT_CHANGED', didoxId: 'B'.repeat(32) })
    // c3: needs_check before saving ever started — Didox holds nothing.
    await run.setInvoice('301111111', 'c3', { state: 'needs_check', code: 'COUNTERPARTY_MISMATCH' })
    await run.finish('failed', { code: 'APP_CLOSED', message: 'ilova yopildi' })

    const found = await j.findNeedsCheck('2026-09')
    expect(found.map((f) => f.invoice.contractId)).toEqual(['c1'])
    expect(found[0]).toMatchObject({ runId: run.runId, firmTin: '301111111' })
    expect(found[0]!.invoice.savingAt).toBe('2026-10-13T06:00:05.000Z')

    expect(await j.findNeedsCheck('2026-08')).toEqual([])
  })
})

describe('needs-check entries and recovery (c2)', () => {
  const needsCheck = async () => {
    const j = journal()
    const run = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('300000001')] })
    await run.setInvoice('300000001', 'c1', { state: 'saving', savingAt: '2026-10-13T09:32:00.000Z' })
    await run.setInvoice('300000001', 'c1', { state: 'needs_check', code: 'SAVED_ID_UNKNOWN', message: 'topilmadi' })
    await run.finish('done')
    return { j, runId: run.runId }
  }
  const entry = async (j: ReturnType<typeof journal>, runId: string) => (await j.read(runId))?.firms[0]?.invoices[0]

  it('keeps the record when the accountant has dealt with it, and stops searching for it', async () => {
    const { j, runId } = await needsCheck()

    await j.resolveNeedsCheck(runId, '300000001', 'c1')

    expect(await entry(j, runId)).toMatchObject({ state: 'needs_check', resolved: true })
    expect(await j.findNeedsCheck('2026-09')).toEqual([]) // a resolved one is not searched for again either
  })

  it('writes down a draft a later run identified, for flushIdFound to send', async () => {
    const { j, runId } = await needsCheck()

    await j.attachFoundId(runId, '300000001', 'c1', 'A'.repeat(32))

    expect(await entry(j, runId)).toMatchObject({ state: 'id_found', didoxId: 'A'.repeat(32) })
  })

  it('refreshes the reason when the draft is still not found', async () => {
    const { j, runId } = await needsCheck()

    await j.refreshNeedsCheck(runId, '300000001', 'c1', 'bugun ham topilmadi')

    expect(await entry(j, runId)).toMatchObject({ state: 'needs_check', message: 'bugun ham topilmadi' })
  })
})

describe('pushFlags — every needs-check reaches the shared server (M13)', () => {
  type Call = { kind: 'record' | 'resolve'; month: string; contractId: string; flag?: unknown }

  /** Answers each write with the next queued result (ok when the queue is empty) and records what was asked. */
  function fakeServer(answers: FlagWriteResult[] = []) {
    const calls: Call[] = []
    const next = async (): Promise<FlagWriteResult> => answers.shift() ?? { ok: true }
    const sink: FlagSink = {
      recordNeedsCheck: async (month, contractId, flag) => (calls.push({ kind: 'record', month, contractId, flag }), next()),
      resolveNeedsCheck: async (month, contractId) => (calls.push({ kind: 'resolve', month, contractId }), next()),
    }
    return { sink, calls }
  }

  const flagged = async (j = journal()) => {
    const run = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('300000001', [{}, {}])] })
    await run.setInvoice('300000001', 'c1', { state: 'saving', savingAt: '2026-10-13T09:32:00.000Z' })
    await run.setInvoice('300000001', 'c1', {
      state: 'needs_check',
      code: 'SAVED_ID_AMBIGUOUS',
      message: 'Ikki nomzod',
      candidateIds: ['A'.repeat(32), 'B'.repeat(32)],
    })
    return { j, run }
  }
  const sync = async (j: ReturnType<typeof journal>, runId: string, contractId = 'c1') =>
    (await j.read(runId))?.firms[0]?.invoices.find((i) => i.contractId === contractId)?.flagSync

  it('queues a needs-check the moment it is written, and sends it with the run id', async () => {
    const { j, run } = await flagged()
    expect(await sync(j, run.runId)).toBe('pending')
    const server = fakeServer()

    expect(await j.pushFlags(server.sink)).toEqual({ sent: 1, cleared: 0, left: 0, unauthorized: false })

    expect(server.calls).toEqual([
      {
        kind: 'record',
        month: '2026-09',
        contractId: 'c1',
        flag: { runId: run.runId, code: 'SAVED_ID_AMBIGUOUS', message: 'Ikki nomzod', candidateIds: ['A'.repeat(32), 'B'.repeat(32)] },
      },
    ])
    expect(await sync(j, run.runId)).toBe('sent')
  })

  it('sends a flag once — a second push has nothing to do', async () => {
    const { j } = await flagged()
    await j.pushFlags(fakeServer().sink)
    const again = fakeServer()

    await j.pushFlags(again.sink)

    expect(again.calls).toEqual([])
  })

  it('keeps the flag queued while the server is down, and sends it later', async () => {
    const { j, run } = await flagged()

    expect(await j.pushFlags(fakeServer([{ ok: false, status: 0, message: 'down' }]).sink)).toMatchObject({ sent: 0, left: 1 })
    expect(await sync(j, run.runId)).toBe('pending')

    expect(await j.pushFlags(fakeServer().sink)).toMatchObject({ sent: 1, left: 0 })
  })

  it('stops at a refused robot key and leaves the rest for later', async () => {
    const { j, run } = await flagged()
    await run.setInvoice('300000001', 'c2', { state: 'needs_check', code: 'COUNTERPARTY_MISMATCH', message: 'nom mos emas' })
    const server = fakeServer([{ ok: false, status: 401, message: 'Sessiya tugagan' }])

    expect(await j.pushFlags(server.sink)).toEqual({ sent: 0, cleared: 0, left: 2, unauthorized: true })
    expect(server.calls).toHaveLength(1)
  })

  it('keeps the flags queued when the server forbids the robot (403) — a key problem, not the flag', async () => {
    const { j, run } = await flagged()

    expect(await j.pushFlags(fakeServer([{ ok: false, status: 403, message: 'Forbidden' }]).sink)).toMatchObject({ left: 1, unauthorized: true })
    expect(await sync(j, run.runId)).toBe('pending')
  })

  it('does a full pass of its own when asked while another push is still going', async () => {
    const { j, run } = await flagged()
    let release: (() => void) | null = null
    const slow: FlagSink = {
      recordNeedsCheck: () => new Promise((ok) => (release = () => ok({ ok: true }))),
      resolveNeedsCheck: async () => ({ ok: true }),
    }
    const first = j.pushFlags(slow)
    await vi.waitFor(() => expect(release).not.toBeNull())
    // A newer needs-check arrives while the first push is waiting on the server.
    await run.setInvoice('300000001', 'c2', { state: 'needs_check', code: 'COUNTERPARTY_MISMATCH', message: 'nom mos emas' })
    const server = fakeServer()
    const second = j.pushFlags(server.sink)
    release!()
    await first

    expect(await second).toMatchObject({ sent: 1 })
    expect(server.calls.map((c) => c.contractId)).toEqual(['c2'])
  })

  it('gives up on a flag the server refuses for good (the contract is gone)', async () => {
    const { j, run } = await flagged()

    await j.pushFlags(fakeServer([{ ok: false, status: 404, message: 'Shartnoma topilmadi' }]).sink)
    const again = fakeServer()
    await j.pushFlags(again.sink)

    expect(again.calls).toEqual([])
    expect(await sync(j, run.runId)).toBeUndefined()
  })

  it('sends a newer reason again', async () => {
    const { j, run } = await flagged()
    await run.finish('done')
    await j.pushFlags(fakeServer().sink)

    await j.refreshNeedsCheck(run.runId, '300000001', 'c1', 'bugun ham topilmadi')
    const server = fakeServer()
    await j.pushFlags(server.sink)

    expect(server.calls).toMatchObject([{ kind: 'record', flag: { message: 'bugun ham topilmadi' } }])
  })

  it("resolves the server's flag once the draft is found and marked here", async () => {
    const { j, run } = await flagged()
    await run.finish('done')
    await j.pushFlags(fakeServer().sink)

    await j.attachFoundId(run.runId, '300000001', 'c1', 'A'.repeat(32))
    await j.flushIdFound({ markDraft: async () => ({ ok: true, row: {} as never }) })
    const server = fakeServer()

    expect(await j.pushFlags(server.sink)).toMatchObject({ cleared: 1 })
    expect(server.calls).toEqual([{ kind: 'resolve', month: '2026-09', contractId: 'c1' }])
    expect(await sync(j, run.runId)).toBeUndefined()
  })

  it("settles another computer's flag when this one marks the invoice (a resolve with nothing to resolve is fine)", async () => {
    const j = journal()
    const run = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('300000001')] })
    await run.setInvoice('300000001', 'c1', { state: 'saving', savingAt: '2026-10-13T09:32:00.000Z' })
    await run.setInvoice('300000001', 'c1', { state: 'id_found', didoxId: 'A'.repeat(32) })
    await run.setInvoice('300000001', 'c1', { state: 'marked' })
    const server = fakeServer([{ ok: false, status: 404, message: 'Tekshiruv belgisi topilmadi' }])

    await j.pushFlags(server.sink)

    expect(server.calls).toEqual([{ kind: 'resolve', month: '2026-09', contractId: 'c1' }])
    expect(await sync(j, run.runId)).toBeUndefined()
  })

  it('queues nothing when a resolution made on the server is mirrored here', async () => {
    const { j, run } = await flagged()
    await run.finish('done')
    await j.pushFlags(fakeServer().sink)

    await j.resolveNeedsCheck(run.runId, '300000001', 'c1')
    const server = fakeServer()
    await j.pushFlags(server.sink)

    expect(server.calls).toEqual([])
  })

  it('queues the needs-check a crashed run leaves behind', async () => {
    const j = journal()
    const run = await j.start({ month: '2026-09', trigger: 'manual', firms: [firm('300000001')] })
    await run.setInvoice('300000001', 'c1', { state: 'saving', savingAt: '2026-10-13T09:32:00.000Z' })

    await j.recoverStaleRuns()
    const server = fakeServer()
    await j.pushFlags(server.sink)

    expect(server.calls).toMatchObject([{ kind: 'record', contractId: 'c1', flag: { code: 'INTERRUPTED_SAVE', runId: run.runId } }])
  })

  it('keeps an old run on disk while its flag has not reached the server', async () => {
    const j = journal()
    const { run } = await flagged(j)
    await run.finish('done')
    // Marked now, so only the queued resolve of the server's flag still needs this run.
    await j.attachFoundId(run.runId, '300000001', 'c1', 'A'.repeat(32))
    await j.flushIdFound({ markDraft: async () => ({ ok: true, row: {} as never }) })
    for (let i = 0; i < 51; i++) {
      now += 60_000
      await (await j.start({ month: '2026-09', trigger: 'manual', firms: [] })).finish('done')
    }

    await j.rotate()

    expect(await j.read(run.runId)).not.toBeNull()
  })
})
