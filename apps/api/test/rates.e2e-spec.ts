import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

describe('Rate changes (Module 5)', () => {
  let app: INestApplication<App>;
  let agent: Agent;
  let id: string;
  let rates: string;

  /** Etalon contract with its operations; `today` decides which months are completed. */
  async function setup(today: string) {
    app = await createTestApp({ today });
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
    rates = `/api/contracts/${id}/rates`;
    const ops = `/api/contracts/${id}/operations`;
    await agent.post(ops).send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '60000000' }).expect(201);
    await agent.post(ops).send({ date: '2026-01-20', type: 'PRINCIPAL_REPAYMENT', amount: '15000000' }).expect(201);
  }

  afterEach(async () => {
    await app.close();
  });

  it('applies a change from the 1st of next month, or the same day if entered on the 1st (FR-5.1)', async () => {
    await setup('2026-03-20');
    const mid = await agent.post(rates).send({ ratePercent: '16', changedOn: '2026-03-15' }).expect(201);
    expect(mid.body.warnings).toEqual([]);
    expect(mid.body.contract.rates.at(-1)).toMatchObject({
      ratePercent: '16',
      changedOn: '2026-03-15',
      effectiveFrom: '2026-04-01',
      initial: false,
    });
    expect(mid.body.contract.currentRate.ratePercent).toBe('14');

    const first = await agent.post(rates).send({ ratePercent: '15', changedOn: '2026-04-01' }).expect(201);
    // same effective date — the later entry wins (CR-5)
    expect(first.body.contract.rates.at(-1)).toMatchObject({ ratePercent: '15', effectiveFrom: '2026-04-01' });
  });

  it('warns before re-calculating completed months, then recalculates April (FR-5.5, CR-9)', async () => {
    await setup('2026-05-10');
    const ask = await agent.post(rates).send({ ratePercent: '16', changedOn: '2026-03-15' }).expect(409);
    expect(ask.body.warnings).toEqual([
      { code: 'RETROACTIVE', message: 'Tugagan oylar qayta hisoblanadi: Aprel 2026' },
    ]);
    await agent.post(rates).send({ ratePercent: '16', changedOn: '2026-03-15', confirmWarnings: true }).expect(201);
    const report = (await agent.get(`/api/contracts/${id}/report`)).body;
    const april = report.months.find((m: { month: string }) => m.month === '2026-04');
    expect(april).toMatchObject({ rates: ['16'], interest: '591780.82' }); // 45M × 16% × 30 / 365
  });

  it('requires the change to take effect after the initial rate (FR-5.1)', async () => {
    await setup('2026-03-20');
    for (const changedOn of ['2025-12-15', '2026-01-01']) {
      const res = await agent.post(rates).send({ ratePercent: '16', changedOn }).expect(400);
      expect(res.body.errors.changedOn).toEqual([
        "Stavka o'zgarishi shartnoma boshlanishidan keyin amal qilishi kerak",
      ]);
    }
    await agent.post(rates).send({ ratePercent: '0', changedOn: '2026-03-15' }).expect(400);
    await agent.post(rates).send({ ratePercent: '16', changedOn: '2026-02-30' }).expect(400);
  });

  it('deletes a change but never the initial rate (FR-5.3)', async () => {
    await setup('2026-03-20');
    const created = await agent.post(rates).send({ ratePercent: '16', changedOn: '2026-03-15' }).expect(201);
    const [initial, change] = created.body.contract.rates;
    expect(initial.initial).toBe(true);
    await agent.delete(`${rates}/${change.id}`).expect(204);
    expect((await agent.get(`/api/contracts/${id}`)).body.rates).toHaveLength(1);
    const res = await agent.delete(`${rates}/${initial.id}`).expect(400);
    expect(res.body.message).toBe("Boshlang'ich stavkani o'chirib bo'lmaydi — qiymatini tuzating");
    await agent.delete(`${rates}/${change.id}`).expect(404);
  });

  it("corrects the initial rate's value only, warning about every completed month (FR-5.4)", async () => {
    await setup('2026-03-20');
    const [initial] = (await agent.get(`/api/contracts/${id}`)).body.rates;
    const ask = await agent.patch(`${rates}/${initial.id}`).send({ ratePercent: '15' }).expect(409);
    expect(ask.body.warnings).toEqual([
      { code: 'RETROACTIVE', message: 'Tugagan oylar qayta hisoblanadi: Yanvar 2026 – Fevral 2026' },
    ]);
    const res = await agent.patch(`${rates}/${initial.id}`).send({ ratePercent: '15', confirmWarnings: true }).expect(200);
    expect(res.body.contract.rates[0]).toMatchObject({
      ratePercent: '15',
      changedOn: '2026-01-01',
      effectiveFrom: '2026-01-01',
      initial: true,
    });

    const change = await agent.post(rates).send({ ratePercent: '16', changedOn: '2026-03-15' }).expect(201);
    const other = change.body.contract.rates.at(-1);
    const refused = await agent.patch(`${rates}/${other.id}`).send({ ratePercent: '17' }).expect(400);
    expect(refused.body.message).toBe("Faqat boshlang'ich stavka tuzatiladi — bu o'zgarishni o'chirib, qayta kiriting");
  });

  it('keeps the start date before every rate change (FR-5.1 with FR-2.5)', async () => {
    await setup('2026-03-20');
    await agent.post(rates).send({ ratePercent: '16', changedOn: '2026-03-15' }).expect(201);
    const res = await agent.patch(`/api/contracts/${id}`).send({ startDate: '2026-04-01' }).expect(400);
    expect(res.body.errors.startDate).toEqual([
      "Boshlanish sanasi stavka o'zgarishidan (01.04.2026) oldin bo'lishi kerak",
    ]);
    await agent.patch(`/api/contracts/${id}`).send({ startDate: '2026-03-31' }).expect(200);
  });

  it('requires a session', async () => {
    await setup('2026-03-20');
    await request(app.getHttpServer()).post(rates).send({ ratePercent: '16', changedOn: '2026-03-15' }).expect(401);
  });
});
