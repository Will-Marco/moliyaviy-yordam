import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from '@/lib/api'
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
}

export interface OperationInput {
  date: string
  type: OperationType
  amount: string
  note: string | null
  confirmWarnings?: boolean
}

export interface Warning {
  code: string
  message: string
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
    mutationFn: (id: string) => apiFetch<void>(`/contracts/${contractId}/operations/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

/** FR-3.3: a 409 that lists warnings the accountant may confirm with "Baribir saqlash". */
export function warningsToConfirm(error: unknown): Warning[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const body = error.body as { code?: string; warnings?: Warning[] } | undefined
  return body?.code === 'CONFIRMATION_REQUIRED' && body.warnings ? body.warnings : null
}

export const OPERATION_TYPES: { value: OperationType; label: string; long: string }[] = [
  { value: 'DISBURSEMENT', label: 'Berildi', long: 'Moliyaviy yordam berildi' },
  { value: 'PRINCIPAL_REPAYMENT', label: 'Qaytarildi', long: 'Asosiy qarz qaytarildi' },
  { value: 'INTEREST_PAYMENT', label: "Foiz to'landi", long: "Foiz to'landi" },
]
