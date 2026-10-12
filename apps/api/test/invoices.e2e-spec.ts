import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

const LINE_JANUARY = 'Берилган молиявий ёрдамнинг фоиз куринишидаги даромади за январь 2026 г.';

/** SRS etalon (№ 1, 14 %, 05.01 — 60 mln, 20.01 — 15 mln) seen on 07.10.2026. */
describe('Monthly invoice list (Module 7)', () => {
  let app: INestApplication<App>;
  let agent: Agent;
  let lenderId: string;
  let borrowerId: string;
  let id: string;
  let ops: string;

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
    lenderId = await company('ALFA SAVDO', '300000001');
    borrowerId = await company('BETA TEXNO', '300000002');
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
    ops = `/api/contracts/${id}/operations`;
    await agent.post(ops).send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '60000000' }).expect(201);
    await agent.post(ops).send({ date: '2026-01-20', type: 'PRINCIPAL_REPAYMENT', amount: '15000000' }).expect(201);
  });

  afterEach(async () => {
    await app.close();
  });

  const draft = (month: string, contractId = id) => `/api/invoices/${month}/${contractId}/draft`;

  it('lists the etalon January invoice with the §9.1 line (FR-7.1–7.3 acceptance)', async () => {
    const res = await agent.get('/api/invoices?month=2026-01').expect(200);
    expect(res.body.month).toBe('2026-01');
    expect(res.body.rows).toEqual([
      {
        contractId: id,
        lender: { id: lenderId, name: 'ALFA SAVDO', tin: '300000001' },
        borrower: { id: borrowerId, name: 'BETA TEXNO', tin: '300000002' },
        contract: { number: '1', signedOn: '2025-12-28' },
        lineName: LINE_JANUARY,
        amount: '552328.77',
        draft: null,
      },
    ]);
  });

  it('defaults to last month and lists every completed month since the earliest start', async () => {
    const res = await agent.get('/api/invoices').expect(200);
    expect(res.body.month).toBe('2026-09');
    expect(res.body.months).toEqual([
      '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01',
    ]);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.lenders).toEqual([{ id: lenderId, name: 'ALFA SAVDO', tin: '300000001' }]);
  });

  it('offers every lender for the filter, even one without invoices that month (FR-7.5)', async () => {
    await agent
      .post('/api/contracts')
      .send({
        number: '2',
        signedOn: '2026-01-01',
        lenderId: borrowerId,
        borrowerId: lenderId,
        limitAmount: '1000000',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        ratePercent: '10',
      })
      .expect(201);
    const res = await agent.get('/api/invoices?month=2026-01').expect(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.lenders.map((l: { name: string }) => l.name)).toEqual(['ALFA SAVDO', 'BETA TEXNO']);
  });

  it('is empty when there are no contracts', async () => {
    await resetDb(app);
    agent = await loggedInAgent(app);
    const res = await agent.get('/api/invoices').expect(200);
    expect(res.body).toEqual({ month: null, months: [], lenders: [], rows: [] });
    await agent.get('/api/invoices?month=2026-01').expect(400);
  });

  it('leaves out contracts without interest in the month (FR-7.1)', async () => {
    await agent
      .post('/api/contracts')
      .send({
        number: '2',
        signedOn: '2026-01-01',
        lenderId,
        borrowerId,
        limitAmount: '1000000',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        ratePercent: '10',
      })
      .expect(201);
    const res = await agent.get('/api/invoices?month=2026-01').expect(200);
    expect(res.body.rows.map((r: { contract: { number: string } }) => r.contract.number)).toEqual(['1']);
  });

  it('rejects a malformed or not yet completed month', async () => {
    await agent.get('/api/invoices?month=2026-13').expect(400);
    await agent.get('/api/invoices?month=2026-10').expect(400);
    await agent.get('/api/invoices?month=2027-01').expect(400);
    await agent.get('/api/invoices?month=2025-12').expect(400); // before the earliest contract
  });

  it('marks a draft by hand, with an optional Didox ID, and unmarks it (FR-7.4)', async () => {
    const marked = await agent.put(draft('2026-01')).send({ didoxDocumentId: 'D-42' }).expect(200);
    expect(marked.body).toMatchObject({
      amount: '552328.77',
      draft: { amount: '552328.77', didoxDocumentId: 'D-42', amountChanged: false },
    });
    expect(Date.parse(marked.body.draft.draftedAt)).not.toBeNaN();

    await agent.put(draft('2026-02')).send({}).expect(200);
    const list = await agent.get('/api/invoices?month=2026-02').expect(200);
    expect(list.body.rows[0].draft).toMatchObject({ didoxDocumentId: null });

    await agent.delete(draft('2026-01')).expect(204);
    const after = await agent.get('/api/invoices?month=2026-01').expect(200);
    expect(after.body.rows[0].draft).toBeNull();
    await agent.delete(draft('2026-01')).expect(404);
  });

  it('warns before marking an already drafted invoice again (FR-7.4)', async () => {
    await agent.put(draft('2026-01')).send({ didoxDocumentId: 'D-1' }).expect(200);
    const conflict = await agent.put(draft('2026-01')).send({ didoxDocumentId: 'D-2' }).expect(409);
    expect(conflict.body).toMatchObject({ code: 'CONFIRMATION_REQUIRED', warnings: [{ code: 'ALREADY_DRAFTED' }] });
    expect(conflict.body.warnings[0].message).toContain('D-1');

    const confirmed = await agent.put(draft('2026-01')).send({ didoxDocumentId: 'D-2', confirmWarnings: true }).expect(200);
    expect(confirmed.body.draft.didoxDocumentId).toBe('D-2');
  });

  it('flags a draft whose month was recalculated afterwards', async () => {
    await agent.put(draft('2026-01')).send({}).expect(200);
    await agent.post(ops).send({ date: '2026-01-25', type: 'DISBURSEMENT', amount: '1000000' }).expect(201);
    const res = await agent.get('/api/invoices?month=2026-01').expect(200);
    expect(res.body.rows[0].amount).not.toBe('552328.77');
    expect(res.body.rows[0].draft).toMatchObject({ amount: '552328.77', amountChanged: true });
  });

  const DIDOX_ID = '36B734EEC5FE11F1BEFEFA163EA3FD69';

  it('records whether a draft was marked by hand or created in Didox by the app (M8)', async () => {
    const manual = await agent.put(draft('2026-01')).send({}).expect(200);
    expect(manual.body.draft.source).toBe('manual');

    const fromDidox = await agent.put(draft('2026-02')).send({ didoxDocumentId: DIDOX_ID, source: 'didox' }).expect(200);
    expect(fromDidox.body.draft).toMatchObject({ source: 'didox', didoxDocumentId: DIDOX_ID });
    const list = await agent.get('/api/invoices?month=2026-02').expect(200);
    expect(list.body.rows[0].draft.source).toBe('didox');
  });

  it('requires a real Didox document ID when the app marks a draft (M8)', async () => {
    await agent.put(draft('2026-01')).send({ source: 'didox' }).expect(400);
    await agent.put(draft('2026-01')).send({ source: 'didox', didoxDocumentId: 'D-42' }).expect(400);
    await agent.put(draft('2026-01')).send({ source: 'robot', didoxDocumentId: DIDOX_ID }).expect(400);
    await agent.put(draft('2026-01')).send({ didoxDocumentId: 'D-42' }).expect(200); // by hand: free text, as before
  });

  it('refuses to mark a draft whose amount in Didox no longer matches the month (M8)', async () => {
    await agent.post(ops).send({ date: '2026-01-25', type: 'DISBURSEMENT', amount: '1000000' }).expect(201);

    const conflict = await agent
      .put(draft('2026-01'))
      .send({ source: 'didox', didoxDocumentId: DIDOX_ID, expectedAmount: '552328.77' })
      .expect(409);
    expect(conflict.body).toMatchObject({ code: 'AMOUNT_CHANGED' });
    const list = await agent.get('/api/invoices?month=2026-01').expect(200);
    expect(list.body.rows[0].draft).toBeNull();

    const current = list.body.rows[0].amount as string;
    await agent.put(draft('2026-01')).send({ source: 'didox', didoxDocumentId: DIDOX_ID, expectedAmount: current }).expect(200);
    await agent.put(draft('2026-02')).send({ expectedAmount: '12,5' }).expect(400);
  });

  it('lets the app attach its Didox ID to a hand mark that has none, but never overwrites an ID (M8)', async () => {
    await agent.put(draft('2026-01')).send({}).expect(200);
    const attached = await agent.put(draft('2026-01')).send({ source: 'didox', didoxDocumentId: DIDOX_ID }).expect(200);
    expect(attached.body.draft).toMatchObject({ source: 'didox', didoxDocumentId: DIDOX_ID });

    const other = '4593FDCEC24511F1B1CBFA163EA3FD69';
    const conflict = await agent.put(draft('2026-01')).send({ source: 'didox', didoxDocumentId: other }).expect(409);
    expect(conflict.body).toMatchObject({ code: 'CONFIRMATION_REQUIRED', warnings: [{ code: 'ALREADY_DRAFTED' }] });

    await agent.put(draft('2026-02')).send({ didoxDocumentId: 'D-7' }).expect(200);
    await agent.put(draft('2026-02')).send({ source: 'didox', didoxDocumentId: DIDOX_ID }).expect(409);
  });

  it('refuses to mark a month without interest, an open month or an unknown contract', async () => {
    await agent.put(draft('2025-12')).send({}).expect(400);
    await agent.put(draft('2026-10')).send({}).expect(400);
    await agent.put(draft('2026-01', '01900000-0000-7000-8000-000000000000')).send({}).expect(404);
    await agent.put(draft('2026-01', 'abc')).send({}).expect(400);
    await agent.put(draft('2026-01')).send({ didoxDocumentId: 'x'.repeat(101) }).expect(400);
  });
});
