import { backupsToDelete } from './retention.js';

const daily = (date: string) => `daily-${date}.tgz`;
/** 2026-09-29 … 2026-10-12: the 14 days before "today" in these tests — always kept. */
const lastTwoWeeks = Array.from({ length: 14 }, (_, i) => daily(new Date(Date.UTC(2026, 8, 29 + i)).toISOString().slice(0, 10)));

describe('backupsToDelete', () => {
  it('keeps the last 14 days and drops older daily backups', () => {
    const files = [...lastTwoWeeks, ...['2026-09-28', '2026-09-27', '2026-09-01'].map(daily)];

    expect(backupsToDelete(files, '2026-10-12')).toEqual([daily('2026-09-28'), daily('2026-09-27')]);
  });

  it('keeps the first backup of each of the last 12 months and drops older months', () => {
    const files = [...lastTwoWeeks, ...['2026-08-03', '2026-08-04', '2025-11-02', '2025-10-31', '2025-10-05'].map(daily)];

    expect(backupsToDelete(files, '2026-10-12')).toEqual([daily('2026-08-04'), daily('2025-10-31'), daily('2025-10-05')]);
  });

  it('always keeps the newest 14 daily backups, so a wrong system clock cannot wipe the history', () => {
    const days = Array.from({ length: 20 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const files = [...days, '2030-01-01'].map(daily);

    const deleted = backupsToDelete(files, '2030-01-01');

    expect(deleted).toHaveLength(files.length - 14);
    expect(deleted).not.toContain(daily('2026-09-20'));
    expect(deleted).not.toContain(daily('2026-09-08'));
  });

  it('never touches files that are not daily backups', () => {
    const files = ['before-migrate-2024-01-01T00-00-00-000Z.tgz', 'notes.txt', 'daily-2020-01-01.tgz.partial'];

    expect(backupsToDelete(files, '2026-10-12')).toEqual([]);
  });
});
