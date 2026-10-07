/** CR-5 — mirrors apps/api/src/contracts/rates.ts: the 1st → that day, otherwise the 1st of next month. */
export function effectiveFromOf(changedOn: string): string {
  if (changedOn.endsWith('-01')) return changedOn
  const [year, month] = changedOn.split('-').map(Number)
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
}
