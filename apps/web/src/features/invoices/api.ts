import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Party } from '@/features/contracts/api'
import { apiFetch } from '@/lib/api'

/** One invoice = one contract × one completed month, one line (FR-7.2). */
export interface Invoice {
  contractId: string
  lender: Party
  borrower: Party
  contract: { number: string; signedOn: string }
  lineName: string
  /** Rounded month interest — the invoice amount (FR-7.3). */
  amount: string
  /** Null — ready; otherwise drafted in Didox (FR-7.4). */
  draft: {
    /** The amount when it was drafted. */
    amount: string
    didoxDocumentId: string | null
    draftedAt: string
    amountChanged: boolean
    /** `didox` — the desktop app saved it in Didox (M8); `manual` — marked by hand. */
    source: 'manual' | 'didox'
  } | null
}

export interface InvoiceList {
  /** Null when no month is complete yet. */
  month: string | null
  /** Completed months, newest first. */
  months: string[]
  /** Every lender in any contract — the filter does not depend on the month (FR-7.5). */
  lenders: Party[]
  rows: Invoice[]
}

export const invoicesKey = ['invoices'] as const

/** No month → the API picks last month. */
export function useInvoices(month?: string) {
  return useQuery({
    queryKey: [...invoicesKey, month ?? 'latest'],
    queryFn: () => apiFetch<InvoiceList>(month ? `/invoices?month=${month}` : '/invoices'),
  })
}

export interface MarkDraftInput {
  didoxDocumentId?: string
  confirmWarnings?: boolean
}

const draftPath = (month: string, contractId: string) => `/invoices/${month}/${contractId}/draft`

export function useMarkDraft(month: string, contractId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: MarkDraftInput) => apiFetch<Invoice>(draftPath(month, contractId), { method: 'PUT', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: invoicesKey }),
  })
}

export function useUnmarkDraft(month: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (contractId: string) => apiFetch<void>(draftPath(month, contractId), { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: invoicesKey }),
  })
}
