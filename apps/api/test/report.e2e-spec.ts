import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

/** SRS etalon, seen on 15.03.2026. */
describe('Monthly interest report (Module 4)', () => {
  let app: INestApplication<App>;
  let agent: Agent;
  let id: string;
  let ops: string;

  beforeEach(async () => {
    app = await createTestApp({ today: '2026-03-15' });
    await resetDb(app);
    agent = await loggedInAgent(app);
    const company = async (name: string, tin: string) =>
      (
        await agent
          .post('/api/companies')
          .send({ name, address: 'Toshkent', tin, bankAccount: '20208000100000000001', mfo: '01071' })
          .expect(201)
      ).body.id as string;
    const lenderId = await company('A MCHJ', '300000001');
    const borrowerId = await company('B MCHJ', '300000002');
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
    id = contract.body.id;
    ops = `/api/contracts/${id}/operations`;
    await agent.post(ops).send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '60000000' }).expect(201);
    await agent.post(ops).send({ date: '2026-01-20', type: 'PRINCIPAL_REPAYMENT', amount: '15000000' }).expect(201);
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports every month from the start to today, the current one partial (FR-4.1)', async () => {
    const res = await agent.get(`/api/contracts/${id}/report`).expect(200);
    expect(res.body.asOf).toBe('2026-03-15');
    expect(res.body.months.map((m: Record<string, unknown>) => [m.month, m.interest, m.partial, m.to])).toEqual([
      ['2026-01', '552328.77', false, '2026-01-31'],
      ['2026-02', '483287.67', false, '2026-02-28'],
      ['2026-03', '258904.11', true, '2026-03-15'], // 45M × 14% × 15 / 365
    ]);
    expect(res.body.months[0]).toMatchObject({
      rates: ['14'],
      openingBalance: '0.00',
      disbursed: '60000000.00',
      repaid: '15000000.00',
      closingBalance: '45000000.00',
      interestExact: '552328.767123',
      interestPaid: '0.00',
      interestDebt: '552328.77',
    });
  });

  it('shows the segments behind each month (FR-4.2)', async () => {
    const res = await agent.get(`/api/contracts/${id}/report`).expect(200);
    expect(res.body.months[0].segments).toEqual([
      { from: '2026-01-01', to: '2026-01-04', days: 4, balance: '0.00', ratePercent: '14', yearDays: 365, interestExact: '0.000000' },
      { from: '2026-01-05', to: '2026-01-19', days: 15, balance: '60000000.00', ratePercent: '14', yearDays: 365, interestExact: '345205.479452' },
      { from: '2026-01-20', to: '2026-01-31', days: 12, balance: '45000000.00', ratePercent: '14', yearDays: 365, interestExact: '207123.287671' },
    ]);
  });

  it('puts interest debt for completed months on the contract and in the list (FR-4.4)', async () => {
    await agent.post(ops).send({ date: '2026-02-05', type: 'INTEREST_PAYMENT', amount: '552328.77' }).expect(201);
    const report = (await agent.get(`/api/contracts/${id}/report`)).body;
    expect(report.totals).toEqual({
      interestAccrued: '1294520.55',
      interestPaid: '552328.77',
      interestDebt: '742191.78',
      interestDebtCompleted: '483287.67',
    });
    expect((await agent.get(`/api/contracts/${id}`)).body.totals.interestDebt).toBe('483287.67');
    expect((await agent.get('/api/contracts')).body[0].totals.interestDebt).toBe('483287.67');
  });

  it('warns when an interest payment exceeds the interest accrued by its date (FR-4.5)', async () => {
    // accrued through 01.02: January 552 328,77 + 1 day of February 17 260,27
    const ask = await agent.post(ops).send({ date: '2026-02-01', type: 'INTEREST_PAYMENT', amount: '600000' }).expect(409);
    expect(ask.body.warnings).toEqual([
      {
        code: 'INTEREST_OVERPAID',
        message: "Foiz to'lovi shu sanagacha hisoblangan foiz qarzidan (569 589,04 so'm) ko'p",
      },
    ]);
    await agent.post(ops).send({ date: '2026-02-01', type: 'INTEREST_PAYMENT', amount: '569589.04' }).expect(201);
  });

  it('warns when shrinking a disbursement leaves an earlier interest payment above accrued interest', async () => {
    await agent.post(ops).send({ date: '2026-02-01', type: 'INTEREST_PAYMENT', amount: '500000' }).expect(201);
    const [disbursement] = (await agent.get(ops)).body;
    const ask = await agent.patch(`${ops}/${disbursement.id}`).send({ amount: '20000000' }).expect(409);
    const overpaid = ask.body.warnings.find((w: { code: string }) => w.code === 'INTEREST_OVERPAID');
    expect(overpaid.message).toMatch(/^01\.02\.2026 dagi foiz to'lovi shu sanagacha hisoblangan foiz qarzidan \(.+ so'm\) ko'p bo'lib qoladi$/);
  });

  it('keeps future-dated operations out of every figure until their date (CR-11)', async () => {
    const body = { date: '2026-04-01', type: 'DISBURSEMENT', amount: '1000000' };
    const ask = await agent.post(ops).send(body).expect(409);
    expect(ask.body.warnings.map((w: { code: string }) => w.code)).toEqual(['FUTURE_DATE']);
    await agent.post(ops).send({ ...body, confirmWarnings: true }).expect(201);

    const list = (await agent.get(ops)).body;
    expect(list.at(-1)).toMatchObject({ date: '2026-04-01', scheduled: true });
    expect(list[0].scheduled).toBe(false);
    expect((await agent.get(`/api/contracts/${id}`)).body.totals).toMatchObject({
      disbursed: '60000000.00',
      principalBalance: '45000000.00',
    });
    const report = (await agent.get(`/api/contracts/${id}/report`)).body;
    expect(report.months).toHaveLength(3);
  });

  it('404s for an unknown contract and requires a session', async () => {
    await agent.get('/api/contracts/0192f000-0000-7000-8000-000000000000/report').expect(404);
    await request(app.getHttpServer()).get(`/api/contracts/${id}/report`).expect(401);
  });
});
