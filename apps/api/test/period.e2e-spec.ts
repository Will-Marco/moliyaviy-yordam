import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

function binary(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

/** SRS etalon (A → B) plus a later contract (C → B), seen on 15.03.2026. */
describe('Period report and Excel (Module 12)', () => {
  let app: INestApplication<App>;
  let agent: Agent;
  let etalonId: string;
  let laterId: string;

  beforeEach(async () => {
    app = await createTestApp({ today: '2026-03-15' });
    await resetDb(app);
    agent = await loggedInAgent(app);
    const company = async (name: string, tin: string) =>
      (await agent.post('/api/companies').send({ name, tin }).expect(201)).body.id as string;
    const a = await company('A MCHJ', '300000001');
    const b = await company('B MCHJ', '300000002');
    const c = await company('C MCHJ', '300000003');
    const contract = async (number: string, lenderId: string, startDate: string) =>
      (
        await agent
          .post('/api/contracts')
          .send({
            number,
            signedOn: startDate,
            lenderId,
            borrowerId: b,
            limitAmount: '10000000000',
            startDate,
            endDate: '2027-07-31',
            ratePercent: '14',
          })
          .expect(201)
      ).body.id as string;
    etalonId = await contract('1', a, '2026-01-01');
    laterId = await contract('2', c, '2026-03-01');
    const ops = `/api/contracts/${etalonId}/operations`;
    await agent.post(ops).send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '60000000' }).expect(201);
    await agent.post(ops).send({ date: '2026-01-20', type: 'PRINCIPAL_REPAYMENT', amount: '15000000' }).expect(201);
    await agent
      .post(`/api/contracts/${laterId}/operations`)
      .send({ date: '2026-03-02', type: 'DISBURSEMENT', amount: '1000000' })
      .expect(201);
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports movements inside the period and balances at its end (FR-12.2 acceptance)', async () => {
    const res = await agent.get('/api/reports/period?from=2026-01&to=2026-02').expect(200);
    expect(res.body).toEqual({
      from: '2026-01',
      to: '2026-02',
      asOf: '2026-03-15',
      rows: [
        {
          contractId: etalonId,
          disbursed: '60000000.00',
          repaid: '15000000.00',
          interest: '1035616.44',
          interestPaid: '0.00',
          closingBalance: '45000000.00',
          interestDebt: '1035616.44',
        },
      ],
    });
  });

  it('counts the current month up to today and includes contracts started in the period', async () => {
    const res = await agent.get('/api/reports/period?from=2026-03&to=2026-03').expect(200);
    expect(res.body.rows.map((r: { contractId: string; interest: string }) => [r.contractId, r.interest])).toEqual([
      [laterId, '5369.86'], // 1 mln × 14 % × 14 / 365; newest first, like the contract list
      [etalonId, '258904.11'],
    ]);
  });

  it('rejects malformed, reversed or future periods', async () => {
    await agent.get('/api/reports/period?from=2026-13&to=2026-02').expect(400);
    await agent.get('/api/reports/period?from=2026-02&to=2026-01').expect(400);
    await agent.get('/api/reports/period?from=2026-01&to=2026-04').expect(400);
    await agent.get('/api/reports/period?to=2026-02').expect(400);
  });

  it('exports the chosen contracts, in the given order, with a total row (FR-12.3)', async () => {
    const res = await agent
      .post('/api/reports/period.xlsx')
      .send({ from: '2026-01', to: '2026-03', contractIds: [laterId, etalonId] })
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-disposition']).toContain('Davr_2026-01_2026-03');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    const sheet = book.getWorksheet('Davr hisoboti')!;
    const values = (row: number) => (sheet.getRow(row).values as unknown[]).slice(1);
    const header = sheet.getRow(4).values as unknown[];
    expect(header.slice(1, 5)).toEqual(['Shartnoma', 'Sana', 'Beruvchi', 'Beruvchi STIR']);
    expect(values(5).slice(0, 7)).toEqual(['2', excelDate('2026-03-01'), 'C MCHJ', '300000003', 'B MCHJ', '300000002', 1000000]);
    expect(values(6).slice(0, 1)).toEqual(['1']);
    expect(values(6).slice(6)).toEqual([60000000, 15000000, 1294520.55, 0, 45000000, 1294520.55]);
    expect(values(7)[0]).toBe('Jami');
    expect(values(7).slice(6)).toEqual([61000000, 15000000, 1299890.41, 0, 46000000, 1299890.41]);
  });

  it('validates the export request', async () => {
    await agent.post('/api/reports/period.xlsx').send({ from: '2026-01', to: '2026-02', contractIds: ['x'] }).expect(400);
    await agent.post('/api/reports/period.xlsx').send({ from: '2026-01', to: '2026-02' }).expect(400);
  });
});

const excelDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
