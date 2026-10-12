import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

describe('Operations (Module 3)', () => {
  let app: INestApplication<App>;
  let agent: Agent;
  let contractId: string;
  let ops: string;
  let lenderId: string;
  let otherId: string;

  const company = async (name: string, tin: string) =>
    (
      await agent
        .post('/api/companies')
        .send({ name, address: 'Toshkent', tin, bankAccount: '20208000100000000001', mfo: '01071' })
        .expect(201)
    ).body.id as string;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDb(app);
    agent = await loggedInAgent(app);
    lenderId = await company('A MCHJ', '300000001');
    const borrowerId = await company('B MCHJ', '300000002');
    otherId = await company('C MCHJ', '300000003');
    const contract = await agent
      .post('/api/contracts')
      .send({
        number: '1',
        signedOn: '2026-01-01',
        lenderId,
        borrowerId,
        limitAmount: '10000000000',
        startDate: '2026-01-01',
        endDate: '2027-07-31',
        ratePercent: '14',
      })
      .expect(201);
    contractId = contract.body.id;
    ops = `/api/contracts/${contractId}/operations`;
  });

  afterEach(async () => {
    await app.close();
  });

  const etalon = async () => {
    await agent.post(ops).send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '60000000' }).expect(201);
    await agent
      .post(ops)
      .send({ date: '2026-01-20', type: 'PRINCIPAL_REPAYMENT', amount: '15000000', note: "Asosiy qarzdan" })
      .expect(201);
  };

  it('records the SRS etalon and keeps a running balance (FR-3.1, FR-3.4)', async () => {
    await etalon();
    const res = await agent.get(ops).expect(200);
    expect(res.body).toEqual([
      {
        id: expect.any(String),
        date: '2026-01-05',
        type: 'DISBURSEMENT',
        amount: '60000000.00',
        note: null,
        balanceAfter: '60000000.00',
        scheduled: false,
      },
      {
        id: expect.any(String),
        date: '2026-01-20',
        type: 'PRINCIPAL_REPAYMENT',
        amount: '15000000.00',
        note: 'Asosiy qarzdan',
        balanceAfter: '45000000.00',
        scheduled: false,
      },
    ]);
  });

  it('shows totals on the contract and in the list (FR-3.5)', async () => {
    await etalon();
    await agent.post(ops).send({ date: '2026-02-05', type: 'INTEREST_PAYMENT', amount: '552328.77' }).expect(201);
    const totals = {
      disbursed: '60000000.00',
      repaid: '15000000.00',
      interestPaid: '552328.77',
      principalBalance: '45000000.00',
    };
    expect((await agent.get(`/api/contracts/${contractId}`)).body.totals).toMatchObject(totals);
    expect((await agent.get('/api/contracts')).body[0].totals).toMatchObject(totals);
  });

  it('asks for confirmation when the limit is exceeded, then saves (FR-3.3)', async () => {
    const body = { date: '2026-02-01', type: 'DISBURSEMENT', amount: '10000000001' };
    const ask = await agent.post(ops).send(body).expect(409);
    expect(ask.body).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      warnings: [{ code: 'LIMIT_EXCEEDED', message: "Jami berilgan summa limitdan 1,00 so'mga oshadi" }],
    });
    expect((await agent.get(ops)).body).toEqual([]);

    const saved = await agent.post(ops).send({ ...body, confirmWarnings: true }).expect(201);
    expect(saved.body.warnings.map((w: { code: string }) => w.code)).toEqual(['LIMIT_EXCEEDED']);
    expect(saved.body.operation.amount).toBe('10000000001.00');
  });

  it('allows a negative balance after confirmation (CR-10)', async () => {
    await etalon();
    const body = { date: '2026-01-25', type: 'PRINCIPAL_REPAYMENT', amount: '50000000' };
    const ask = await agent.post(ops).send(body).expect(409);
    expect(ask.body.warnings[0].code).toBe('NEGATIVE_BALANCE');
    await agent.post(ops).send({ ...body, confirmWarnings: true }).expect(201);
    const rows = (await agent.get(ops)).body;
    expect(rows.at(-1).balanceAfter).toBe('-5000000.00');
  });

  it.each([
    ['amount', { amount: '0' }],
    ['amount', { amount: '-5' }],
    ['amount', { amount: 5 }],
    ['type', { type: 'GIFT' }],
    ['date', { date: '2026-02-30' }],
    ['note', { note: 'x'.repeat(501) }],
  ])('validates %s', async (field, patch) => {
    const res = await agent
      .post(ops)
      .send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '1', ...patch })
      .expect(400);
    expect(res.body.errors).toHaveProperty(field);
  });

  it('stores a blank note as null', async () => {
    const res = await agent
      .post(ops)
      .send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '1', note: '   ' })
      .expect(201);
    expect(res.body.operation.note).toBeNull();
  });

  it('edits and deletes operations (FR-3.2)', async () => {
    await etalon();
    const [first] = (await agent.get(ops)).body;
    const edited = await agent.patch(`${ops}/${first.id}`).send({ amount: '70000000', note: 'tuzatildi' }).expect(200);
    expect(edited.body.operation).toMatchObject({ amount: '70000000.00', note: 'tuzatildi' });
    expect((await agent.get(ops)).body.at(-1).balanceAfter).toBe('55000000.00');

    const shrink = await agent.patch(`${ops}/${first.id}`).send({ amount: '10000000' }).expect(409);
    expect(shrink.body.warnings[0].code).toBe('NEGATIVE_BALANCE');

    const repayment = (await agent.get(ops)).body.at(-1);
    await agent.delete(`${ops}/${repayment.id}`).expect(204); // harmless: deleted at once
    expect((await agent.get(ops)).body).toHaveLength(1);
    await agent.delete(`${ops}/${repayment.id}`).expect(404);
  });

  it('asks before deleting an operation that leaves a negative balance, then deletes it (FR-3.2)', async () => {
    await etalon();
    const [disbursement] = (await agent.get(ops)).body;

    const ask = await agent.delete(`${ops}/${disbursement.id}`).expect(409);
    expect(ask.body).toMatchObject({ code: 'CONFIRMATION_REQUIRED', warnings: [{ code: 'NEGATIVE_BALANCE' }] });
    expect((await agent.get(ops)).body).toHaveLength(2);

    await agent.delete(`${ops}/${disbursement.id}?confirmWarnings=true`).expect(204);
    expect((await agent.get(ops)).body).toHaveLength(1);
  });

  it('warns when a change would alter the interest of a month already drafted in Didox', async () => {
    await etalon();
    await agent.put(`/api/invoices/2026-01/${contractId}/draft`).send({}).expect(200); // January drafted: 552 328,77

    const add = await agent.post(ops).send({ date: '2026-01-25', type: 'DISBURSEMENT', amount: '1000000' }).expect(409);
    const drafted = add.body.warnings.find((w: { code: string }) => w.code === 'DRAFTED_INVOICE_CHANGES');
    expect(drafted.message).toContain('Yanvar 2026');
    expect(drafted.message).toMatch(/552\s328,77/);

    const repayment = (await agent.get(ops)).body.at(-1);
    const del = await agent.delete(`${ops}/${repayment.id}`).expect(409);
    expect(del.body.warnings.map((w: { code: string }) => w.code)).toContain('DRAFTED_INVOICE_CHANGES');

    // A change that leaves January's interest as drafted asks nothing.
    await agent.post(ops).send({ date: '2026-09-10', type: 'PRINCIPAL_REPAYMENT', amount: '1000000' }).expect(201);
  });

  it('asks before a deletion leaves an interest payment above the interest due (FR-4.5)', async () => {
    await agent.post(ops).send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '60000000' }).expect(201);
    await agent.post(ops).send({ date: '2026-02-10', type: 'INTEREST_PAYMENT', amount: '500000' }).expect(201);
    const [disbursement] = (await agent.get(ops)).body;

    const ask = await agent.delete(`${ops}/${disbursement.id}`).expect(409);
    expect(ask.body.warnings.map((w: { code: string }) => w.code)).toEqual(['INTEREST_OVERPAID']);
  });

  it('keeps operations scoped to their contract', async () => {
    await etalon();
    const [first] = (await agent.get(ops)).body;
    const other = await agent
      .post('/api/contracts')
      .send({
        number: '2',
        signedOn: '2026-01-01',
        lenderId,
        borrowerId: otherId,
        limitAmount: '1000',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        ratePercent: '10',
      })
      .expect(201);
    await agent.delete(`/api/contracts/${other.body.id}/operations/${first.id}`).expect(404);
    await agent.get('/api/contracts/0192f000-0000-7000-8000-000000000000/operations').expect(404);
  });

  it('locks the parties once the contract has operations (FR-3.6)', async () => {
    await etalon();
    const res = await agent.patch(`/api/contracts/${contractId}`).send({ borrowerId: otherId }).expect(400);
    expect(res.body.errors.borrowerId).toEqual(["Operatsiyasi bor shartnomada tomonlarni o'zgartirib bo'lmaydi"]);
    await agent.patch(`/api/contracts/${contractId}`).send({ lenderId, number: '1/A' }).expect(200);
  });

  it('requires a session', async () => {
    await request(app.getHttpServer()).get(ops).expect(401);
  });
});
