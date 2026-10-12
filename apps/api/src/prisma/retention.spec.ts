import { backupsToDelete } from './retention.js';

const daily = (date: string) => `daily-${date}.tgz`;

describe('backupsToDelete', () => {
  it('keeps the last 14 days and drops older daily backups', () => {
    const files = ['2026-10-12', '2026-09-29', '2026-09-28', '2026-09-27', '2026-09-01'].map(daily);

    expect(backupsToDelete(files, '2026-10-12')).toEqual([daily('2026-09-28'), daily('2026-09-27')]);
  });

  it('keeps the first backup of each of the last 12 months and drops older months', () => {
    const files = ['2026-08-03', '2026-08-04', '2025-11-02', '2025-10-31', '2025-10-05'].map(daily);

    expect(backupsToDelete(files, '2026-10-12')).toEqual([daily('2026-08-04'), daily('2025-10-31'), daily('2025-10-05')]);
  });

  it('never touches files that are not daily backups', () => {
    const files = ['before-migrate-2024-01-01T00-00-00-000Z.tgz', 'notes.txt', 'daily-2020-01-01.tgz.partial'];

    expect(backupsToDelete(files, '2026-10-12')).toEqual([]);
  });
});
