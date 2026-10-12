import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { Warning } from '@/lib/warnings'
import { contractsKey } from './api'

export type OperationType = 'DISBURSEMENT' | 'PRINCIPAL_REPAYMENT' | 'INTEREST_PAYMENT'

export interface Operation {
  id: string
  date: string
  type: OperationType
  amount: string
  note: string | null
  /** Principal balance after this operation. */
  balanceAfter: string
  /** Dated after today — not yet in any figure (CR-11). */
  scheduled: boolean
}

export interface OperationInput {
  date: string
  type: OperationType
  amount: string
  note: string | null
  confirmWarnings?: boolean
}

const operationsKey = (contractId: string) => [...contractsKey, contractId, 'operations'] as const

export function useOperations(contractId: string) {
  return useQuery({
    queryKey: operationsKey(contractId),
    queryFn: () => apiFetch<Operation[]>(`/contracts/${contractId}/operations`),
  })
}

/** Balances and totals change with every operation — refresh the contract views too (CR-9). */
function useInvalidateContract() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: contractsKey })
}

export function useSaveOperation(contractId: string, id?: string) {
  const invalidate = useInvalidateContract()
  return useMutation({
    mutationFn: (body: OperationInput) =>
      apiFetch<{ operation: Operation; warnings: Warning[] }>(
        id ? `/contracts/${contractId}/operations/${id}` : `/contracts/${contractId}/operations`,
        { method: id ? 'PATCH' : 'POST', body },
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteOperation(contractId: string) {
  const invalidate = useInvalidateContract()
  return useMutation({
    mutationFn: ({ id, confirmWarnings = false }: { id: string; confirmWarnings?: boolean }) =>
      apiFetch<void>(`/contracts/${contractId}/operations/${id}${confirmWarnings ? '?confirmWarnings=true' : ''}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  })
}

export const OPERATION_TYPES: { value: OperationType; label: string; long: string }[] = [
  { value: 'DISBURSEMENT', label: 'Berildi', long: 'Moliyaviy yordam berildi' },
  { value: 'PRINCIPAL_REPAYMENT', label: 'Qaytarildi', long: 'Asosiy qarz qaytarildi' },
  { value: 'INTEREST_PAYMENT', label: "Foiz to'landi", long: "Foiz to'landi" },
]
