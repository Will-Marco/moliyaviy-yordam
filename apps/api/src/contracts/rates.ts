import type { IsoDate } from '../common/dates.js';

/** CR-5: entered on the 1st → in force that day; otherwise from the 1st of the next month. */
export function effectiveFromOf(changedOn: IsoDate): IsoDate {
  if (changedOn.endsWith('-01')) return changedOn;
  const [year, month] = changedOn.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/**
 * FR-5.5: completed months (before today's month, never before the start month) that a rate in force
 * from `effectiveFrom` recalculates — they may already be invoiced. Null if none.
 */
export function retroactiveMonths(
  effectiveFrom: IsoDate,
  startDate: IsoDate,
  today: IsoDate,
): { from: string; to: string } | null {
  const current = today.slice(0, 7);
  const from = [effectiveFrom.slice(0, 7), startDate.slice(0, 7)].sort().at(-1)!;
  if (from >= current) return null;
  const [year, month] = current.split('-').map(Number);
  const to = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  return { from, to };
}
