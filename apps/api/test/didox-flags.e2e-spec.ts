import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

const MONTH = '2026-09';
const INSTALL = 'buxgalter-1';
const DIDOX_ID = '0123456789ABCDEF0123456789ABCDEF';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UNKNOWN_CONTRACT = '01900000-0000-7000-8000-000000000000';

const needsCheck = {
  code: 'SAVED_ID_AMBIGUOUS',
  message: "Saqlangan qoralamani aniqlab bo'lmadi",
  didoxId: DIDOX_ID,
  candidateIds: [DIDOX_ID, 'FEDCBA9876543210FEDCBA9876543210'],
  runId: 'run-1',
  createdByInstall: INSTALL,
};

/** M13 §4.1: the robot's per-invoice flags live on the server so every accountant sees them. */
describe('Didox invoice flags (M13)', () => {
  let app: INestApplication<App>;
  let agent: Agent;
  let id: string;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDb(app);
    agent = await loggedInAgent(app);
    const company = async (name: string, tin: string) =>
      (
        await agent
          .post('/api/companies')
          .send({ name, address: 'Toshkent', tin, bankAccount: '20208000100000000001', mfo: '01071' })
          .expect(201)
      ).body.id as string;
    const lenderId = await company('ALFA SAVDO', '300000001');
    const borrowerId = await company('BETA TEXNO', '300000002');
    const contract = await agent
      .post('/api/contracts')
      .send({
        number: '1',
        signedOn: '2025-12-28',
        lenderId,
        borrowerId,
        limitAmount: '10000000000',
        startDate: '2026-01-01',
        endDate: '2027-07-31',
        ratePercent: '14',
      })
      .expect(201);
    id = contract.body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const base = (month = MONTH, contractId = id) => `/api/didox-flags/${month}/${contractId}`;
  const list = async (month = MONTH) => (await agent.get(`/api/didox-flags?month=${month}`).expect(200)).body;

  it('returns an empty map for a month without flags', async () => {
    expect(await list()).toEqual({});
  });

  it('sets a skip idempotently and clears it', async () => {
    const first = await agent.put(`${base()}/skip`).send({ createdByInstall: INSTALL }).expect(200);
    expect(first.body).toEqual({ skipped: { at: expect.stringMatching(ISO) } });
    const again = await agent.put(`${base()}/skip`).send({ createdByInstall: 'buxgalter-2' }).expect(200);
    expect(again.body).toEqual(first.body);
    expect(await list()).toEqual({ [id]: first.body });

    await agent.delete(`${base()}/skip`).expect(204);
    expect(await list()).toEqual({});
    await agent.delete(`${base()}/skip`).expect(204);
  });

  it('records a needs-check flag in the web shape, plus who recorded it', async () => {
    const res = await agent.post(`${base()}/needs-check`).send(needsCheck).expect(201);
    const { createdByInstall, ...flag } = needsCheck;
    const expected = { needsCheck: { ...flag, createdByInstall, at: expect.stringMatching(ISO) } };
    expect(res.body).toEqual(expected);
    expect(await list()).toEqual({ [id]: expected });
  });

  it('omits the optional fields that were not given', async () => {
    await agent
      .post(`${base()}/needs-check`)
      .send({ code: 'WRONG_FIRM', message: 'Boshqa firma', createdByInstall: INSTALL })
      .expect(201);
    const flags = await list();
    expect(flags[id].needsCheck).toEqual({ code: 'WRONG_FIRM', message: 'Boshqa firma', createdByInstall: INSTALL, at: expect.stringMatching(ISO) });
  });

  it('replaces the unresolved needs-check of the same invoice instead of adding a second', async () => {
    await agent.post(`${base()}/needs-check`).send(needsCheck).expect(201);
    await agent
      .post(`${base()}/needs-check`)
      .send({ code: 'SAVE_FAILED', message: 'Saqlanmadi', runId: 'run-2', createdByInstall: 'buxgalter-2' })
      .expect(201);
    const flags = await list();
    expect(flags[id].needsCheck).toEqual({
      code: 'SAVE_FAILED',
      message: 'Saqlanmadi',
      runId: 'run-2',
      createdByInstall: 'buxgalter-2',
      at: expect.stringMatching(ISO),
    });
    expect(await app.get(PrismaService).didoxInvoiceFlag.count()).toBe(1);
  });

  it('resolves a needs-check, keeping the row, and 404s when nothing is left to resolve', async () => {
    await agent.post(`${base()}/needs-check`).send(needsCheck).expect(201);
    await agent.post(`${base()}/needs-check/resolve`).expect(204);
    expect(await list()).toEqual({});
    const res = await agent.post(`${base()}/needs-check/resolve`).expect(404);
    expect(res.body).toEqual({ statusCode: 404, message: 'Tekshiruv belgisi topilmadi', error: 'Not Found' });

    // A new problem after the resolved one is a new flag; history stays.
    await agent.post(`${base()}/needs-check`).send(needsCheck).expect(201);
    expect(await app.get(PrismaService).didoxInvoiceFlag.count()).toBe(2);
  });

  it('keeps a skip and a needs-check side by side, and months apart', async () => {
    await agent.put(`${base()}/skip`).send({ createdByInstall: INSTALL }).expect(200);
    await agent.post(`${base()}/needs-check`).send(needsCheck).expect(201);
    await agent.put(`${base('2026-08')}/skip`).send({ createdByInstall: INSTALL }).expect(200);

    const flags = await list();
    expect(Object.keys(flags[id]).sort()).toEqual(['needsCheck', 'skipped']);
    expect(await list('2026-08')).toEqual({ [id]: { skipped: { at: expect.stringMatching(ISO) } } });
    expect(await list('2026-07')).toEqual({});
  });

  it('allows at most one unresolved flag per invoice, month and state in the database', async () => {
    const prisma = app.get(PrismaService);
    const row = { contractId: id, month: MONTH, state: 'skipped', code: 'SKIPPED_BY_USER', message: '-', createdByInstall: INSTALL };
    await prisma.didoxInvoiceFlag.create({ data: row });
    // P2002 is what the service's concurrent-write fallback recognises.
    await expect(prisma.didoxInvoiceFlag.create({ data: row })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.didoxInvoiceFlag.create({ data: { ...row, state: 'other' } })).rejects.toThrow();
    await expect(prisma.didoxInvoiceFlag.create({ data: { ...row, month: '2026-13' } })).rejects.toThrow();
    await prisma.didoxInvoiceFlag.create({ data: { ...row, resolvedAt: new Date() } });
  });

  describe('errors', () => {
    it('404s for an unknown contract on every write', async () => {
      const path = base(MONTH, UNKNOWN_CONTRACT);
      const res = await agent.put(`${path}/skip`).send({ createdByInstall: INSTALL }).expect(404);
      expect(res.body).toEqual({ statusCode: 404, message: 'Shartnoma topilmadi', error: 'Not Found' });
      await agent.delete(`${path}/skip`).expect(404);
      await agent.post(`${path}/needs-check`).send(needsCheck).expect(404);
      await agent.post(`${path}/needs-check/resolve`).expect(404);
    });

    it('400s for a bad month or contract ID', async () => {
      const res = await agent.put(`${base('2026-13')}/skip`).send({ createdByInstall: INSTALL }).expect(400);
      expect(res.body).toEqual({ statusCode: 400, message: "Oy noto'g'ri", error: 'Bad Request' });
      await agent.post(`${base('2026-9')}/needs-check`).send(needsCheck).expect(400);
      await agent.put(`${base(MONTH, 'not-a-uuid')}/skip`).send({ createdByInstall: INSTALL }).expect(400);

      const query = await agent.get('/api/didox-flags?month=2026-13').expect(400);
      expect(query.body.errors).toHaveProperty('month');
      await agent.get('/api/didox-flags').expect(400);
    });

    it('validates the bodies like the rest of the API', async () => {
      const skip = await agent.put(`${base()}/skip`).send({}).expect(400);
      expect(skip.body).toMatchObject({ statusCode: 400, message: "Ma'lumotlar noto'g'ri", errors: { createdByInstall: expect.any(Array) } });

      const { code: _code, message: _message, ...noCode } = needsCheck;
      const res = await agent.post(`${base()}/needs-check`).send(noCode).expect(400);
      expect(Object.keys(res.body.errors).sort()).toEqual(['code', 'message']);
      await agent.post(`${base()}/needs-check`).send({ ...needsCheck, extra: 1 }).expect(400);
      await agent.post(`${base()}/needs-check`).send({ ...needsCheck, code: 'not a code' }).expect(400);
      await agent.post(`${base()}/needs-check`).send({ ...needsCheck, candidateIds: 'x' }).expect(400);
      expect(await list()).toEqual({});
    });

    it('needs a session', async () => {
      await request(app.getHttpServer()).get(`/api/didox-flags?month=${MONTH}`).expect(401);
      await request(app.getHttpServer()).put(`${base()}/skip`).send({ createdByInstall: INSTALL }).expect(401);
    });
  });
});
