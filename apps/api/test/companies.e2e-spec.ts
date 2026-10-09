import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { createTestApp, loggedInAgent, resetDb } from './helpers.js';

const validCompany = {
  name: '"ALFA SAVDO" MCHJ',
  address: "Toshkent sh., Chilonzor tumani, Bunyodkor ko'chasi, 1",
  tin: '300000001',
  vatRegCode: '326020000001',
  bankAccount: '20208000100000000001',
  mfo: '01071',
};

describe('Companies (FR-1.2)', () => {
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

  it('creates a company and returns it', async () => {
    const res = await agent.post('/api/companies').send(validCompany).expect(201);
    expect(res.body).toMatchObject(validCompany);
    expect(res.body.id).toEqual(expect.any(String));
  });

  it('trims text fields', async () => {
    const res = await agent
      .post('/api/companies')
      .send({ ...validCompany, name: '  "ALFA SAVDO" MCHJ  ', address: ' Toshkent ' })
      .expect(201);
    expect(res.body.name).toBe('"ALFA SAVDO" MCHJ');
    expect(res.body.address).toBe('Toshkent');
  });

  it('allows the VAT registration code to be omitted', async () => {
    const { vatRegCode: _omit, ...withoutVat } = validCompany;
    const res = await agent.post('/api/companies').send(withoutVat).expect(201);
    expect(res.body.vatRegCode).toBeNull();
  });

  it('allows address, bank account and MFO to be filled in later (FR-1.2)', async () => {
    const res = await agent.post('/api/companies').send({ name: 'BEST FOR GOOD FUTURE', tin: '307830275' }).expect(201);
    expect(res.body).toMatchObject({ address: null, bankAccount: null, mfo: null, vatRegCode: null });

    const filled = await agent
      .patch(`/api/companies/${res.body.id}`)
      .send({ address: 'Toshkent', bankAccount: '20208000100000000009', mfo: '01071' })
      .expect(200);
    expect(filled.body).toMatchObject({ address: 'Toshkent', bankAccount: '20208000100000000009', mfo: '01071' });

    const cleared = await agent.patch(`/api/companies/${res.body.id}`).send({ bankAccount: null }).expect(200);
    expect(cleared.body.bankAccount).toBeNull();
  });

  it('still validates requisites that are given', async () => {
    const res = await agent
      .post('/api/companies')
      .send({ name: 'X', tin: '307830275', address: '', bankAccount: '123', mfo: '1' })
      .expect(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['address', 'bankAccount', 'mfo']);
  });

  it('lists companies sorted by name', async () => {
    await agent.post('/api/companies').send({ ...validCompany, name: 'BETA', tin: '300000002' });
    await agent.post('/api/companies').send({ ...validCompany, name: 'ALFA', tin: '300000003' });
    const res = await agent.get('/api/companies').expect(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['ALFA', 'BETA']);
  });

  it.each([
    ['tin', '12345678'],
    ['tin', '1234567890'],
    ['tin', '12345678a'],
    ['bankAccount', '2020800010000000000'],
    ['mfo', '0107'],
    ['vatRegCode', '12345'],
    ['name', '   '],
    ['address', ''],
  ])('rejects invalid %s = %j with a field error', async (field, value) => {
    const res = await agent
      .post('/api/companies')
      .send({ ...validCompany, [field]: value })
      .expect(400);
    expect(res.body.errors).toHaveProperty(field);
  });

  it('rejects a duplicate STIR with 409', async () => {
    await agent.post('/api/companies').send(validCompany).expect(201);
    const res = await agent.post('/api/companies').send({ ...validCompany, name: 'BOSHQA' }).expect(409);
    expect(res.body.message).toBe("Bu STIR bilan firma allaqachon mavjud");
  });

  it('gets a company by id and 404s for unknown ids', async () => {
    const created = await agent.post('/api/companies').send(validCompany).expect(201);
    const res = await agent.get(`/api/companies/${created.body.id}`).expect(200);
    expect(res.body.tin).toBe(validCompany.tin);
    await agent.get('/api/companies/0192f000-0000-7000-8000-000000000000').expect(404);
    await agent.get('/api/companies/not-a-uuid').expect(400);
  });

  it('updates a company', async () => {
    const created = await agent.post('/api/companies').send(validCompany).expect(201);
    const res = await agent
      .patch(`/api/companies/${created.body.id}`)
      .send({ name: '"ALFA SAVDO PLUS" MCHJ', vatRegCode: null })
      .expect(200);
    expect(res.body.name).toBe('"ALFA SAVDO PLUS" MCHJ');
    expect(res.body.vatRegCode).toBeNull();
    expect(res.body.tin).toBe(validCompany.tin);
  });

  it('rejects updating to another company STIR', async () => {
    await agent.post('/api/companies').send(validCompany).expect(201);
    const other = await agent
      .post('/api/companies')
      .send({ ...validCompany, tin: '300000009' })
      .expect(201);
    await agent.patch(`/api/companies/${other.body.id}`).send({ tin: validCompany.tin }).expect(409);
  });

  it('rejects unknown fields', async () => {
    await agent.post('/api/companies').send({ ...validCompany, isAdmin: true }).expect(400);
  });
});
