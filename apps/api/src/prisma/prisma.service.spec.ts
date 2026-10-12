import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from './prisma.service.js';

/** A ConfigService stub for a local PGlite database at `dir`. */
const config = (dir: string) => {
  const values: Record<string, unknown> = { DB_DRIVER: 'pglite', DATABASE_URL: '', PGLITE_DATA_DIR: dir };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
};

describe('PrismaService on a local PGlite database (M9a)', () => {
  it('migrates on init, persists across restarts, and snapshots before the first migration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'moliya-')); // own root: `backups` sits next to the data dir
    const dir = join(root, 'db');

    const first = new PrismaService(config(dir));
    await first.onModuleInit();
    await first.company.create({ data: { name: 'PERSIST MCHJ', tin: '305000001' } });
    // Decimal stays exact through the local database.
    const a = await first.company.create({ data: { name: 'A', tin: '305000002' } });
    const b = await first.company.create({ data: { name: 'B', tin: '305000003' } });
    await first.contract.create({
      data: {
        number: '1', signedOn: new Date('2026-01-01'), lenderId: a.id, borrowerId: b.id,
        limitAmount: '99999999999999.99', startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'),
        rateChanges: { create: { ratePercent: '14', changedOn: new Date('2026-01-01'), effectiveFrom: new Date('2026-01-01') } },
      },
    });
    await first.onModuleDestroy();

    // A pre-migration snapshot landed next to the data dir (CONSTITUTION §5).
    expect(readdirSync(join(root, 'backups')).length).toBeGreaterThan(0);

    // A fresh service on the same dir sees the data; migrations do not re-run.
    const second = new PrismaService(config(dir));
    await second.onModuleInit();
    expect(await second.company.count()).toBe(3);
    const ctr = await second.contract.findFirstOrThrow();
    expect(ctr.limitAmount.toFixed(2)).toBe('99999999999999.99');
    await second.onModuleDestroy();

    rmSync(root, { recursive: true, force: true });
  });
});
