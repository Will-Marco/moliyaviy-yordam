import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { downloadFile } from '@/lib/download'
import { contractsKey } from './api'

export interface ReportSegment {
  from: string
  to: string
  days: number
  balance: string
  ratePercent: string
  yearDays: number
  /** 6 decimals, display only. */
  interestExact: string
}

export interface ReportMonth {
  month: string
  from: string
  to: string
  /** Current month — counted up to `to` (today). */
  partial: boolean
  rates: string[]
  openingBalance: string
  disbursed: string
  repaid: string
  closingBalance: string
  /** Rounded to tiyin — the invoiced figure. */
  interest: string
  interestExact: string
  interestPaid: string
  interestDebt: string
  segments: ReportSegment[]
}

export interface Report {
  asOf: string
  months: ReportMonth[]
  totals: { interestAccrued: string; interestPaid: string; interestDebt: string; interestDebtCompleted: string }
}

/** Lives under the contract's query key, so every operation/contract change refreshes it (CR-9). */
export function useReport(contractId: string) {
  return useQuery({
    queryKey: [...contractsKey, contractId, 'report'],
    queryFn: () => apiFetch<Report>(`/contracts/${contractId}/report`),
  })
}

/** FR-6.1 — a mutation, so an expired session goes through the global handler instead of saving an error file. */
export function useExportReport(contractId: string) {
  return useMutation({ mutationFn: () => downloadFile(`/contracts/${contractId}/report.xlsx`) })
}
