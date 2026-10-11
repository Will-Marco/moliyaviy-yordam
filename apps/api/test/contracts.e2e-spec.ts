import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

async function company(agent: Agent, name: string, tin: string): Promise<string> {
  const res = await agent
    .post('/api/companies')
    .send({ name, address: 'Toshkent', tin, bankAccount: '20208000100000000001', mfo: '01071' })
    .expect(201);
  return res.body.id;
}

describe('Contracts (Module 2)', () => {
  let app: INestApplication<App>;
  let agent: Agent;
  let a: string, b: string, c: string, e: string;
  /** SRS etalon: 10 mlrd, 14%, 01.01.2026 – 31.07.2027 */
  let etalon: Record<string, string>;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDb(app);
    agent = await loggedInAgent(app);
    a = await company(agent, 'A MCHJ', '300000001');
    b = await company(agent, 'B MCHJ', '300000002');
    c = await company(agent, 'C MCHJ', '300000003');
    e = await company(agent, 'E MCHJ', '300000005');
    etalon = {
      number: '1',
      signedOn: '2026-01-01',
      lenderId: a,
      borrowerId: b,
      limitAmount: '10000000000',
      startDate: '2026-01-01',
      endDate: '2027-07-31',
      ratePercent: '14',
    };
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates the SRS etalon contract with its initial rate (FR-2.1, CR-5)', async () => {
    const res = await agent.post('/api/contracts').send(etalon).expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      number: '1',
      signedOn: '2026-01-01',
      lender: { id: a, name: 'A MCHJ', tin: '300000001' },
      borrower: { id: b, name: 'B MCHJ', tin: '300000002' },
      limitAmount: '10000000000.00',
      startDate: '2026-01-01',
      endDate: '2027-07-31',
      currentRate: { ratePercent: '14', effectiveFrom: '2026-01-01' },
      totals: { disbursed: '0.00', repaid: '0.00', interestPaid: '0.00', principalBalance: '0.00', interestDebt: '0.00' },
      rates: [{ id: expect.any(String), initial: true, ratePercent: '14', changedOn: '2026-01-01', effectiveFrom: '2026-01-01' }],
    });
  });

  it('rejects impossible dates and years outside 2000–2100 (FR-10.2)', async () => {
    const res = await agent
      .post('/api/contracts')
      .send({ ...etalon, signedOn: '20266-01-01', startDate: '1999-12-31', endDate: '2101-01-01' })
      .expect(400);
    expect(res.body.errors).toMatchObject({
      signedOn: ["Sana noto'g'ri"],
      startDate: ["Yil 2000–2100 oralig'ida bo'lishi kerak"],
      endDate: ["Yil 2000–2100 oralig'ida bo'lishi kerak"],
    });
  });

  it('keeps money and rates exact (no floating point)', async () => {
    const res = await agent
      .post('/api/contracts')
      .send({ ...etalon, limitAmount: '9999999999999999.99', ratePercent: '14.1255' })
      .expect(201);
    expect(res.body.limitAmount).toBe('9999999999999999.99');
    expect(res.body.currentRate.ratePercent).toBe('14.1255');
  });

  it('lists A→B, A→C, E→B newest first (FR-2.3)', async () => {
    await agent.post('/api/contracts').send(etalon).expect(201);
    await agent.post('/api/contracts').send({ ...etalon, number: '2', borrowerId: c, signedOn: '2026-02-01' });
    await agent.post('/api/contracts').send({ ...etalon, number: '7', lenderId: e, signedOn: '2026-03-01' });
    const res = await agent.get('/api/contracts').expect(200);
    expect(res.body.map((x: { lender: { name: string }; borrower: { name: string } }) => `${x.lender.name}→${x.borrower.name}`)).toEqual([
      'E MCHJ→B MCHJ',
      'A MCHJ→C MCHJ',
      'A MCHJ→B MCHJ',
    ]);
    expect(res.body[0]).not.toHaveProperty('rates');
  });

  it.each([
    ['borrowerId', { borrowerId: 'SAME' }, "Beruvchi va oluvchi bir xil firma bo'lishi mumkin emas"],
    ['endDate', { endDate: '2026-01-01' }, "Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak"],
    ['limitAmount', { limitAmount: '0' }, "Summa 0 dan katta bo'lishi kerak"],
    ['limitAmount', { limitAmount: '-5' }, "Summa noto'g'ri: faqat raqam, 2 xonagacha tiyin"],
    ['limitAmount', { limitAmount: '1.234' }, "Summa noto'g'ri: faqat raqam, 2 xonagacha tiyin"],
    ['limitAmount', { limitAmount: 1000 }, "Summa noto'g'ri: faqat raqam, 2 xonagacha tiyin"],
    ['ratePercent', { ratePercent: '0' }, "Stavka 0 dan katta va 100 dan oshmasligi kerak"],
    ['ratePercent', { ratePercent: '100.5' }, "Stavka 0 dan katta va 100 dan oshmasligi kerak"],
    ['ratePercent', { ratePercent: '14.12345' }, "Stavka noto'g'ri: masalan 14 yoki 14,5"],
    ['startDate', { startDate: '2026-02-30' }, "Sana noto'g'ri"],
    ['number', { number: '  ' }, 'Shartnoma raqami kiritilmagan'],
  ])('rejects invalid %s (FR-2.2)', async (field, patch: Record<string, unknown>, message) => {
    const body: Record<string, unknown> = { ...etalon, ...patch };
    if (body.borrowerId === 'SAME') body.borrowerId = a;
    const res = await agent.post('/api/contracts').send(body).expect(400);
    expect(res.body.errors[field]).toContain(message);
  });

  it('rejects unknown companies on the field', async () => {
    const res = await agent
      .post('/api/contracts')
      .send({ ...etalon, lenderId: '0192f000-0000-7000-8000-000000000000' })
      .expect(400);
    expect(res.body.errors.lenderId).toEqual(['Firma topilmadi']);
  });

  it('keeps contract numbers unique within a lender–borrower pair only (FR-2.4)', async () => {
    await agent.post('/api/contracts').send(etalon).expect(201);
    const dup = await agent.post('/api/contracts').send(etalon).expect(409);
    expect(dup.body.errors.number).toEqual(["Bu tomonlar o'rtasida shu raqamli shartnoma allaqachon mavjud"]);
    await agent.post('/api/contracts').send({ ...etalon, borrowerId: c }).expect(201);
  });

  it('gets one contract and 404s otherwise (FR-2.6)', async () => {
    const created = await agent.post('/api/contracts').send(etalon).expect(201);
    const res = await agent.get(`/api/contracts/${created.body.id}`).expect(200);
    expect(res.body).toEqual(created.body);
    await agent.get('/api/contracts/0192f000-0000-7000-8000-000000000000').expect(404);
  });

  it('edits number, date, limit, term and parties but not the rate (FR-2.5)', async () => {
    const { body: created } = await agent.post('/api/contracts').send(etalon).expect(201);
    const res = await agent
      .patch(`/api/contracts/${created.id}`)
      .send({ number: '1/A', limitAmount: '12000000000.50', endDate: '2027-12-31', borrowerId: c })
      .expect(200);
    expect(res.body).toMatchObject({
      number: '1/A',
      limitAmount: '12000000000.50',
      endDate: '2027-12-31',
      borrower: { id: c },
      currentRate: { ratePercent: '14' },
    });
    await agent.patch(`/api/contracts/${created.id}`).send({ ratePercent: '16' }).expect(400);
  });

  it('moves the initial rate with the start and signing dates (CR-5)', async () => {
    const { body: created } = await agent.post('/api/contracts').send(etalon).expect(201);
    const res = await agent
      .patch(`/api/contracts/${created.id}`)
      .send({ startDate: '2025-12-01', signedOn: '2025-11-20' })
      .expect(200);
    expect(res.body.rates).toEqual([
      { id: expect.any(String), initial: true, ratePercent: '14', changedOn: '2025-11-20', effectiveFrom: '2025-12-01' },
    ]);
    expect(res.body.currentRate.effectiveFrom).toBe('2025-12-01');
  });

  it('validates an edit against the stored contract', async () => {
    const { body: created } = await agent.post('/api/contracts').send(etalon).expect(201);
    const dates = await agent.patch(`/api/contracts/${created.id}`).send({ endDate: '2025-12-31' }).expect(400);
    expect(dates.body.errors.endDate).toBeDefined();
    const parties = await agent.patch(`/api/contracts/${created.id}`).send({ borrowerId: a }).expect(400);
    expect(parties.body.errors.borrowerId).toBeDefined();
  });

  it('requires a session', async () => {
    await request(app.getHttpServer()).get('/api/contracts').expect(401);
  });
});
