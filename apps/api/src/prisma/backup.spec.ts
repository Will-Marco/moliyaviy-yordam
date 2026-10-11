import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { snapshot } from './backup.js';

describe('snapshot (M9a backup)', () => {
  it('writes a restorable dump of the database', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'pgdata-'));
    const backups = mkdtempSync(join(tmpdir(), 'pgbackup-'));
    const pg = new PGlite(dataDir);
    await pg.exec('CREATE TABLE t (id INT PRIMARY KEY, v TEXT)');
    await pg.exec("INSERT INTO t (id, v) VALUES (1, 'saqlangan')");

    const file = await snapshot(pg, backups, 'before-migrate');
    expect(readdirSync(backups)).toHaveLength(1);
    expect(statSync(file).size).toBeGreaterThan(0);
    await pg.close();

    // The dump restores into a fresh database with the row intact.
    const restored = new PGlite({ loadDataDir: new Blob([readFileSync(file)]) });
    const { rows } = await restored.query<{ v: string }>('SELECT v FROM t WHERE id = 1');
    expect(rows[0]?.v).toBe('saqlangan');

    rmSync(dataDir, { recursive: true });
    rmSync(backups, { recursive: true });
  });
});
