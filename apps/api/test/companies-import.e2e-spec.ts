import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

const invoice = readFileSync(new URL('./fixtures/didox-invoice-ru.xls', import.meta.url), 'utf8');
const file = (name: string, content = invoice) => ({ name, content });

describe('Company import from Didox invoices (FR-1.3)', () => {
  let app: INestApplication<App>;
  let agent: Awaited<ReturnType<typeof loggedInAgent>>;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDb(app);
    agent = await loggedInAgent(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('previews both parties as new without writing anything', async () => {
    const res = await agent
      .post('/api/companies/import/preview')
      .send({ files: [file('690.xls')] })
      .expect(200);
    expect(res.body.fileErrors).toEqual([]);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((i: { tin: string; status: string }) => [i.tin, i.status])).toEqual([
      ['300000001', 'create'],
      ['300000002', 'create'],
    ]);
    expect(res.body.items[0]).toMatchObject({
      name: '"ALFA SAVDO" MCHJ',
      source: { file: '690.xls', invoiceNo: '690', invoiceDate: '2026-09-15' },
    });
    const list = await agent.get('/api/companies').expect(200);
    expect(list.body).toEqual([]);
  });

  it('marks existing companies as update (with changed fields) or unchanged', async () => {
    await agent.post('/api/companies/import').send({ files: [file('690.xls')] }).expect(200);
    const [alfa] = (await agent.get('/api/companies')).body;
    await agent.patch(`/api/companies/${alfa.id}`).send({ address: 'Eski manzil', mfo: '00000' }).expect(200);

    const res = await agent
      .post('/api/companies/import/preview')
      .send({ files: [file('690.xls')] })
      .expect(200);
    expect(res.body.items[0]).toMatchObject({ tin: '300000001', status: 'update', changes: ['address', 'mfo'] });
    expect(res.body.items[1]).toMatchObject({ tin: '300000002', status: 'unchanged', changes: [] });
  });

  it('applies creates and updates and reports counts', async () => {
    await agent.post('/api/companies').send({
      name: 'ESKI NOM',
      address: 'Eski manzil',
      tin: '300000002',
      bankAccount: '20208000100000000002',
      mfo: '00440',
    });
    const res = await agent.post('/api/companies/import').send({ files: [file('690.xls')] }).expect(200);
    expect(res.body).toMatchObject({ created: 1, updated: 1, unchanged: 0, skipped: 0 });

    const list = (await agent.get('/api/companies')).body as { tin: string; name: string; vatRegCode: string }[];
    expect(list.map((c) => [c.tin, c.name])).toEqual([
      ['300000001', '"ALFA SAVDO" MCHJ'],
      ['300000002', '"BETA TEXNO" MCHJ'],
    ]);
    expect(list[1].vatRegCode).toBe('326020000002');
  });

  it('fills in the requisites of a company added with only a name and STIR', async () => {
    await agent.post('/api/companies').send({ name: 'BETA TEXNO', tin: '300000002' }).expect(201);
    const preview = await agent
      .post('/api/companies/import/preview')
      .send({ files: [file('690.xls')] })
      .expect(200);
    expect(preview.body.items[1]).toMatchObject({
      tin: '300000002',
      status: 'update',
      changes: ['name', 'address', 'vatRegCode', 'bankAccount', 'mfo'],
    });
    await agent.post('/api/companies/import').send({ files: [file('690.xls')] }).expect(200);
    const beta = (await agent.get('/api/companies')).body.find((c: { tin: string }) => c.tin === '300000002');
    expect(beta).toMatchObject({ bankAccount: '20208000100000000002', mfo: '00440' });
    expect(beta.address).toEqual(expect.any(String));
  });

  it('takes the newest invoice when a STIR appears in several files', async () => {
    const older = invoice
      .replace('№ 690 от 15.09.2026', '№ 512 от 15.03.2026')
      .replace("Bunyodkor ko'chasi, 1", 'Eski manzil');
    const res = await agent
      .post('/api/companies/import/preview')
      .send({ files: [file('690.xls'), file('512.xls', older)] })
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].address).toContain("Bunyodkor ko'chasi, 1");
    expect(res.body.items[0].source.invoiceNo).toBe('690');
  });

  it('reports unreadable files and invalid requisites without blocking the rest', async () => {
    const badMfo = invoice.replace('01071&nbsp;', '&nbsp;');
    const res = await agent
      .post('/api/companies/import')
      .send({ files: [file('rasm.xls', 'not an invoice'), file('690.xls', badMfo)] })
      .expect(200);
    expect(res.body.fileErrors).toEqual([
      { file: 'rasm.xls', message: "Didox schyot-faktura fayli tanilmadi" },
    ]);
    expect(res.body).toMatchObject({ created: 1, skipped: 1 });
    const alfa = res.body.items.find((i: { tin: string }) => i.tin === '300000001');
    expect(alfa.status).toBe('error');
    expect(alfa.errors.mfo).toEqual(["MFO 5 ta raqamdan iborat bo'lishi kerak"]);
  });

  it('never clears a stored VAT code when the invoice has none', async () => {
    await agent.post('/api/companies/import').send({ files: [file('690.xls')] }).expect(200);
    const withoutVat = invoice.replace('326020000001 (сертификат активный)', '');
    const res = await agent
      .post('/api/companies/import')
      .send({ files: [file('690.xls', withoutVat)] })
      .expect(200);
    expect(res.body.items[0]).toMatchObject({ tin: '300000001', status: 'unchanged', vatRegCode: '326020000001' });
    const [alfa] = (await agent.get('/api/companies')).body;
    expect(alfa.vatRegCode).toBe('326020000001');
  });

  it('reports every party whose STIR could not be read', async () => {
    const noTin = (n: string) =>
      invoice
        .replace('300000001', '')
        .replace('300000002', '')
        .replace('"ALFA SAVDO" MCHJ', `ALFA ${n}`)
        .replace('"BETA TEXNO" MCHJ', `BETA ${n}`);
    const res = await agent
      .post('/api/companies/import/preview')
      .send({ files: [file('a.xls', noTin('A')), file('b.xls', noTin('B'))] })
      .expect(200);
    expect(res.body.items.map((i: { name: string; status: string }) => [i.name, i.status])).toEqual([
      ['ALFA A', 'error'],
      ['BETA A', 'error'],
      ['ALFA B', 'error'],
      ['BETA B', 'error'],
    ]);
  });

  it('validates the request', async () => {
    await agent.post('/api/companies/import/preview').send({ files: [] }).expect(400);
    const tooMany = Array.from({ length: 51 }, (_, i) => file(`${i}.xls`));
    await agent.post('/api/companies/import/preview').send({ files: tooMany }).expect(400);
  });

  it('requires a session', async () => {
    await request(app.getHttpServer())
      .post('/api/companies/import/preview')
      .send({ files: [file('690.xls')] })
      .expect(401);
  });
});
