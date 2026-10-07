import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { Warning } from '@/lib/warnings'

export interface Party {
  id: string
  name: string
  tin: string
}

export interface Rate {
  id: string
  /** Entered with the contract — can be corrected, never deleted (FR-5.3/5.4). */
  initial: boolean
  ratePercent: string
  changedOn: string
  effectiveFrom: string
}

/** Money and dates are strings ("10000000000.00", "2026-01-01"), exactly as the API sends them. */
export interface Contract {
  id: string
  number: string
  signedOn: string
  lender: Party
  borrower: Party
  limitAmount: string
  startDate: string
  endDate: string
  currentRate: { ratePercent: string; effectiveFrom: string }
  /** FR-3.5 — as of today (CR-11). */
  totals: {
    disbursed: string
    repaid: string
    interestPaid: string
    principalBalance: string
    /** Completed months only — the invoiced debt (FR-4.4). */
    interestDebt: string
  }
  rates?: Rate[]
}

export interface ContractInput {
  number: string
  signedOn: string
  lenderId: string
  borrowerId: string
  limitAmount: string
  startDate: string
  endDate: string
  ratePercent?: string
}

export const contractsKey = ['contracts'] as const

export function useContracts() {
  return useQuery({ queryKey: contractsKey, queryFn: () => apiFetch<Contract[]>('/contracts') })
}

export function useContract(id: string) {
  return useQuery({ queryKey: [...contractsKey, id], queryFn: () => apiFetch<Contract>(`/contracts/${id}`) })
}

export function useSaveContract(id?: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: ContractInput) =>
      id
        ? apiFetch<Contract>(`/contracts/${id}`, { method: 'PATCH', body })
        : apiFetch<Contract>('/contracts', { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: contractsKey }),
  })
}

// ---- Module 5: rate history ----


export interface RateInput {
  ratePercent: string
  changedOn?: string
  confirmWarnings?: boolean
}

type RateResult = { contract: Contract; warnings: Warning[] }

/** id → correct the initial rate (PATCH); no id → add a change (POST). */
export function useSaveRate(contractId: string, id?: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: RateInput) =>
      apiFetch<RateResult>(id ? `/contracts/${contractId}/rates/${id}` : `/contracts/${contractId}/rates`, {
        method: id ? 'PATCH' : 'POST',
        body,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: contractsKey }),
  })
}

export function useDeleteRate(contractId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/contracts/${contractId}/rates/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: contractsKey }),
  })
}
