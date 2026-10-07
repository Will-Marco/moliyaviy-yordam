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

async function workbook(agent: Agent, path: string) {
  const res = await agent.get(path).buffer(true).parse(binary).expect(200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(res.body as unknown as ExcelJS.Buffer);
  return { res, book };
}

/** Cells 1..columnCount of a row; numbers stay numbers, dates become yyyy-mm-dd, empty cells null. */
const row = (sheet: ExcelJS.Worksheet, n: number) =>
  Array.from({ length: sheet.columnCount }, (_, i) => {
    const v = sheet.getRow(n).getCell(i + 1).value;
    return v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null);
  });

describe('Excel export (Module 6)', () => {
  let app: INestApplication<App>;
  let agent: Agent;
  let id: string;
  let path: string;

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
    const lenderId = await company('"ALFA SAVDO" MCHJ', '300000001');
    const borrowerId = await company('"BETA TEXNO" MCHJ', '300000002');
    const contract = await agent
      .post('/api/contracts')
      .send({
        number: '1/A',
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
    path = `/api/contracts/${id}/report.xlsx`;
    const ops = `/api/contracts/${id}/operations`;
    await agent.post(ops).send({ date: '2026-01-05', type: 'DISBURSEMENT', amount: '60000000' }).expect(201);
    await agent
      .post(ops)
      .send({ date: '2026-01-20', type: 'PRINCIPAL_REPAYMENT', amount: '15000000', note: 'Asosiy qarzdan' })
      .expect(201);
    await agent.post(ops).send({ date: '2026-02-05', type: 'INTEREST_PAYMENT', amount: '552328.77' }).expect(201);
  });

  afterEach(async () => {
    await app.close();
  });

  it('downloads an .xlsx named after the contract (FR-6.1)', async () => {
    const { res, book } = await workbook(agent, path);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('filename="Shartnoma_1-A_ALFA-SAVDO_2026-03-15.xlsx"');
    expect(book.worksheets.map((s) => s.name)).toEqual(['Oylik hisobot', "Bo'laklar", 'Operatsiyalar']);
  });

  it('matches the report to the tiyin, as numbers (FR-6.2, FR-6.3)', async () => {
    const { book } = await workbook(agent, path);
    const report = (await agent.get(`/api/contracts/${id}/report`)).body;
    const sheet = book.getWorksheet('Oylik hisobot')!;

    const headerRow = sheet.getColumn(1).values.findIndex((v) => v === 'Oy');
    expect(row(sheet, headerRow)).toEqual([
      'Oy',
      'Stavka, %',
      'Boshidagi qoldiq',
      'Berildi',
      'Qaytarildi',
      'Oxiridagi qoldiq',
      'Hisoblangan foiz',
      "To'langan foiz",
      'Foiz qarzi',
    ]);
    report.months.forEach((m: Record<string, string>, i: number) => {
      const cells = row(sheet, headerRow + 1 + i);
      expect(cells.slice(2).map(Number)).toEqual(
        [m.openingBalance, m.disbursed, m.repaid, m.closingBalance, m.interest, m.interestPaid, m.interestDebt].map(Number),
      );
    });
    expect(row(sheet, headerRow + 1)[0]).toBe('Yanvar 2026');
    expect(row(sheet, headerRow + 1)[6]).toBe(552328.77);
    expect(row(sheet, headerRow + 3)[0]).toBe('Mart 2026 (15.03 gacha)');
    expect(sheet.getRow(headerRow + 1).getCell(7).numFmt).toBe('#,##0.00;-#,##0.00');

    const total = row(sheet, headerRow + 1 + report.months.length);
    expect(total[0]).toBe('Jami');
    expect(total[6]).toBe(Number(report.totals.interestAccrued));
    expect(total[7]).toBe(Number(report.totals.interestPaid));
  });

  it('heads the report with the contract requisites (FR-6.2)', async () => {
    const { book } = await workbook(agent, path);
    const text = book
      .getWorksheet('Oylik hisobot')!
      .getSheetValues()
      .flat()
      .filter((v) => typeof v === 'string')
      .join(' | ');
    for (const expected of [
      'Shartnoma № 1/A, 01.01.2026',
      'Beruvchi',
      '"ALFA SAVDO" MCHJ (STIR 300000001)',
      '"BETA TEXNO" MCHJ (STIR 300000002)',
      '01.01.2026 – 31.07.2027',
      'Hisobot sanasi',
      '15.03.2026',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('lists the segments and the operations ledger (FR-6.2)', async () => {
    const { book } = await workbook(agent, path);
    const segments = book.getWorksheet("Bo'laklar")!;
    expect(row(segments, 1)).toEqual(['Oy', 'Boshi', 'Oxiri', 'Kun', 'Qoldiq', 'Stavka, %', 'Yil kunlari', 'Foiz (aniq)']);
    expect(row(segments, 3)).toEqual(['Yanvar 2026', '2026-01-05', '2026-01-19', 15, 60000000, 14, 365, 345205.479452]);
    expect(segments.rowCount).toBe(1 + 3 + 1 + 1); // Jan: 3 segments, Feb: 1, Mar: 1

    const ledger = book.getWorksheet('Operatsiyalar')!;
    expect(row(ledger, 1)).toEqual(['Sana', 'Berildi', 'Qaytarildi', "Foiz to'landi", 'Qoldiq', 'Izoh']);
    expect(row(ledger, 3)).toEqual(['2026-01-20', null, 15000000, null, 45000000, 'Asosiy qarzdan']);
    expect(row(ledger, 4)).toEqual(['2026-02-05', null, null, 552328.77, 45000000, null]);
  });

  it('404s for an unknown contract and requires a session', async () => {
    await agent.get('/api/contracts/0192f000-0000-7000-8000-000000000000/report.xlsx').expect(404);
    await request(app.getHttpServer()).get(path).expect(401);
  });
});
