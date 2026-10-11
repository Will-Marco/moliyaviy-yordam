import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * Writes a restorable dump of the whole PGlite database (M9a). Used before a migration and for the
 * daily backup. The dump restores via `new PGlite({ loadDataDir })`. Returns the file path.
 */
export async function snapshot(pglite: PGlite, backupsDir: string, label: string): Promise<string> {
  mkdirSync(backupsDir, { recursive: true });
  const dump = await pglite.dumpDataDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(backupsDir, `${label}-${stamp}.tgz`);
  writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
  return file;
}
