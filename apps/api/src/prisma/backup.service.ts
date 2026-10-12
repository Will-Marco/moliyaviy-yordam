import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { PrismaService } from './prisma.service.js';
import { backupsToDelete, dailyBackupName } from './retention.js';

const HOUR = 60 * 60 * 1000;

/**
 * Daily backup of the local database (M9, Sir 2026-10-12: local only, 14 days + one per month for a year,
 * restore by hand — docs/runbooks/restore-backup.md). Runs at start and re-checks every hour, so a PC that
 * stays on overnight still gets the next day's copy. Does nothing on the server (pg) or in tests (in-memory).
 */
@Injectable()
export class BackupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.prisma.localDatabase()) return;
    const run = () => this.runDaily().catch((error: unknown) => this.logger.error(`Zaxira olinmadi: ${String(error)}`));
    void run();
    this.timer = setInterval(run, HOUR);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Writes today's backup if it is missing and prunes old ones. Returns the new file, or null if nothing was due. */
  async runDaily(): Promise<string | null> {
    const local = this.prisma.localDatabase();
    if (!local) return null;
    const file = join(local.backupsDir, dailyBackupName(this.clock.today()));
    let made: string | null = null;
    if (!existsSync(file)) {
      mkdirSync(local.backupsDir, { recursive: true });
      const dump = await local.pglite.dumpDataDir();
      // Write aside, then rename: a crash mid-write never leaves a file that looks like today's finished backup.
      writeFileSync(`${file}.partial`, Buffer.from(await dump.arrayBuffer()));
      renameSync(`${file}.partial`, file);
      made = file;
    }
    for (const old of backupsToDelete(readdirSync(local.backupsDir), this.clock.today())) {
      rmSync(join(local.backupsDir, old), { force: true });
    }
    return made;
  }
}
