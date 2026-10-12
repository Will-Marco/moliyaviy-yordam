import { fromDbDate, type IsoDate, previousMonth, toDbDate } from '../common/dates.js';

const DAILY = /^daily-(\d{4}-\d{2}-\d{2})\.tgz$/;
const KEEP_DAYS = 14;
const KEEP_MONTHS = 12;

/** Daily backup file name for a Tashkent date. */
export const dailyBackupName = (date: IsoDate) => `daily-${date}.tgz`;

/**
 * Daily backups past their keep window (Sir, 2026-10-12): the last 14 days, plus the first backup of each of
 * the last 12 months. The newest 14 daily backups are always kept, whatever the date says, so a wrong system
 * clock cannot empty the folder. Other files (e.g. before-migrate snapshots) are never touched.
 */
export function backupsToDelete(files: string[], today: IsoDate): string[] {
  const oldestDay = fromDbDate(new Date(toDbDate(today).getTime() - (KEEP_DAYS - 1) * 86_400_000));
  let oldestMonth = today.slice(0, 7);
  for (let i = 1; i < KEEP_MONTHS; i++) oldestMonth = previousMonth(oldestMonth);

  const dated = files.flatMap((file) => {
    const date = DAILY.exec(file)?.[1];
    return date ? [{ file, date }] : [];
  });
  const firstOfMonth = new Map<string, string>();
  for (const { date } of dated) {
    const month = date.slice(0, 7);
    if (!firstOfMonth.has(month) || date < firstOfMonth.get(month)!) firstOfMonth.set(month, date);
  }
  const newest = new Set([...dated].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, KEEP_DAYS).map(({ file }) => file));
  return dated
    .filter(({ file, date }) => {
      const month = date.slice(0, 7);
      const monthly = firstOfMonth.get(month) === date && month >= oldestMonth;
      return date < oldestDay && !monthly && !newest.has(file);
    })
    .map(({ file }) => file);
}
