export const ALL_YEARS = 'all'

/**
 * FR-10.3: the year the monthly report shows — the picked one while the report still has it,
 * otherwise the current year (asOf), otherwise the latest year in the report.
 */
export function selectedYear(years: string[], currentYear: string, picked: string | null): string {
  if (picked === ALL_YEARS || (picked && years.includes(picked))) return picked
  if (years.includes(currentYear)) return currentYear
  return years.at(-1) ?? ALL_YEARS
}
