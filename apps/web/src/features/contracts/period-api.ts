import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { downloadFile } from '@/lib/download'
import { contractsKey } from './api'

/** FR-12.2: one contract over the period — movements inside it, balances at its end. */
export interface PeriodRow {
  contractId: string
  disbursed: string
  repaid: string
  /** Σ rounded month interest — equals the period's invoices. */
  interest: string
  interestPaid: string
  closingBalance: string
  interestDebt: string
}

export interface PeriodReport {
  from: string
  to: string
  asOf: string
  rows: PeriodRow[]
}

/** Under the contracts key, so any operation/rate change refreshes it too. */
export function usePeriodReport(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: [...contractsKey, 'period', from, to],
    queryFn: () => apiFetch<PeriodReport>(`/reports/period?from=${from}&to=${to}`),
    enabled,
  })
}

/** FR-12.3 — a mutation, so an expired session goes through the global handler like every other call. */
export function useExportPeriod() {
  return useMutation({
    mutationFn: ({ from, to, contractIds }: { from: string; to: string; contractIds: string[] }) =>
      downloadPeriodXlsx(from, to, contractIds),
  })
}

/** FR-12.3: the contracts on screen, in screen order, as an .xlsx download. */
function downloadPeriodXlsx(from: string, to: string, contractIds: string[]): Promise<void> {
  return downloadFile(
    '/reports/period.xlsx',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, contractIds }) },
    `Davr_${from}_${to}.xlsx`,
  )
}
