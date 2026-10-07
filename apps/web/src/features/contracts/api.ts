import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface Party {
  id: string
  name: string
  tin: string
}

export interface Rate {
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

const contractsKey = ['contracts'] as const

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
