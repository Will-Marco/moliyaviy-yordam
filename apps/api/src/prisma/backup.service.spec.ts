import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { ConfigService } from '@nestjs/config';
import type { Clock } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { BackupService } from './backup.service.js';
import { PrismaService } from './prisma.service.js';

const config = (dir: string) => {
  const values: Record<string, unknown> = { DB_DRIVER: 'pglite', DATABASE_URL: '', PGLITE_DATA_DIR: dir };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
};

describe('daily backup of the local database (M9)', () => {
  it('backs up once a day, keeps the agreed history and leaves migration snapshots alone', async () => {
    const root = mkdtempSync(join(tmpdir(), 'moliya-')); // own root: `backups` sits next to the data dir
    const dir = join(root, 'db');
    const backups = join(root, 'backups');
    const prisma = new PrismaService(config(dir));
    await prisma.onModuleInit(); // also writes a before-migrate snapshot into `backups`
    await prisma.company.create({ data: { name: 'ZAXIRA MCHJ', tin: '306000001' } });
    for (let day = 29; day <= 41; day++) {
      // 2026-09-29 … 2026-10-11: the last two weeks are full, so older dailies fall out of the window.
      writeFileSync(join(backups, `daily-${new Date(Date.UTC(2026, 8, day)).toISOString().slice(0, 10)}.tgz`), 'recent');
    }
    writeFileSync(join(backups, 'daily-2026-09-01.tgz'), 'old'); // first of September: kept as the monthly copy
    writeFileSync(join(backups, 'daily-2026-09-20.tgz'), 'old'); // older than 14 days: dropped
    writeFileSync(join(backups, 'daily-2026-10-01.tgz.partial'), 'cut'); // a write cut short by a crash
    const service = new BackupService(prisma, { today: () => '2026-10-12' } as Clock);

    const made = await service.runDaily();

    expect(made).toBe(join(backups, 'daily-2026-10-12.tgz'));
    const files = readdirSync(backups);
    expect(files).toEqual(expect.arrayContaining(['daily-2026-10-12.tgz', 'daily-2026-09-01.tgz']));
    expect(files).not.toContain('daily-2026-09-20.tgz');
    expect(files.filter((f) => f.endsWith('.partial'))).toEqual([]);
    expect(files.some((f) => f.startsWith('before-migrate-'))).toBe(true);

    expect(await service.runDaily()).toBeNull(); // already done today
    expect(readdirSync(backups)).toHaveLength(files.length);

    const restored = new PGlite({ loadDataDir: new Blob([readFileSync(made!)]) });
    const { rows } = await restored.query<{ name: string }>('SELECT name FROM companies');
    expect(rows).toEqual([{ name: 'ZAXIRA MCHJ' }]);

    await restored.close();
    await prisma.onModuleDestroy();
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the backups folder when it does not exist yet', async () => {
    const root = mkdtempSync(join(tmpdir(), 'moliya-')); // own root: `backups` sits next to the data dir
    const dir = join(root, 'db');
    const backups = join(root, 'backups');
    const prisma = new PrismaService(config(dir));
    await prisma.onModuleInit();
    rmSync(backups, { recursive: true, force: true }); // e.g. an existing database with no migration this run

    const made = await new BackupService(prisma, { today: () => '2026-10-12' } as Clock).runDaily();

    expect(made && readdirSync(backups)).toEqual(['daily-2026-10-12.tgz']);
    await prisma.onModuleDestroy();
    rmSync(root, { recursive: true, force: true });
  });
});
