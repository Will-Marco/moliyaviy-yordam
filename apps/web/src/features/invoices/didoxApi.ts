import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DidoxInvoiceFlags, DidoxRunSummary } from '@/lib/desktop'
import { useDesktop } from '@/lib/desktop'

/** The desktop app's own per-invoice marks for a month — they live next to the API rows, never in it (spec §2, §7). */
export const didoxFlagsKey = ['didox-flags'] as const
export const didoxRunsKey = ['didox-runs'] as const

export type DidoxFlagMap = Record<string, DidoxInvoiceFlags>

/** Only the desktop app keeps these flags; a plain browser (or a pre-M8c build) has none and the query stays idle. */
export function useDidoxFlags(month: string | null) {
  const didox = useDesktop()?.didox
  return useQuery({
    queryKey: [...didoxFlagsKey, month],
    queryFn: () => didox!.invoiceFlags(month!),
    enabled: !!didox?.invoiceFlags && !!month,
  })
}

/** `skip: false` undoes the mark; both directions go through the same bridge call. */
export function useSkipInvoice(month: string) {
  const didox = useDesktop()?.didox
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ contractId, skip }: { contractId: string; skip: boolean }) =>
      didox!.skipInvoice({ month, contractId, skip }),
    onSuccess: () => client.invalidateQueries({ queryKey: didoxFlagsKey }),
  })
}

/** "Hal qilindi" — the accountant has looked at it, so the flag goes. Nothing is written to the API. */
export function useResolveNeedsCheck(month: string) {
  const didox = useDesktop()?.didox
  const client = useQueryClient()
  return useMutation({
    mutationFn: (contractId: string) => didox!.resolveNeedsCheck({ month, contractId }),
    onSuccess: () => client.invalidateQueries({ queryKey: didoxFlagsKey }),
  })
}

export function useDidoxRuns(month: string | null, limit: number) {
  const didox = useDesktop()?.didox
  return useQuery<DidoxRunSummary[]>({
    queryKey: [...didoxRunsKey, month, limit],
    queryFn: () => didox!.listRuns({ month: month!, limit }),
    enabled: !!didox?.listRuns && !!month,
  })
}

export function useDidoxRun(runId: string) {
  const didox = useDesktop()?.didox
  return useQuery({
    queryKey: [...didoxRunsKey, 'detail', runId],
    queryFn: () => didox!.getRun(runId),
    enabled: !!didox?.getRun,
  })
}
