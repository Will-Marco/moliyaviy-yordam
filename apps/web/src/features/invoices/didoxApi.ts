import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { DesktopInstall, DidoxInvoiceFlags, DidoxRunSummary } from '@/lib/desktop'
import { useDesktop } from '@/lib/desktop'

/**
 * The Didox robot's per-invoice flags live on the shared server (M13 §4.1), next to the invoices: every accountant
 * sees them, in the desktop app or a plain browser. Only the run history and screenshots stay on the computer.
 */
export const didoxFlagsKey = ['didox-flags'] as const
export const didoxRunsKey = ['didox-runs'] as const

export type DidoxFlagMap = Record<string, DidoxInvoiceFlags>

/** Who wrote a skip when it was set in a plain browser (the server wants a name for every flag). */
const BROWSER = 'Brauzer'

const flagPath = (month: string, contractId: string) => `/didox-flags/${month}/${contractId}`

export function useDidoxFlags(month: string | null) {
  return useQuery({
    queryKey: [...didoxFlagsKey, month],
    queryFn: () => apiFetch<DidoxFlagMap>(`/didox-flags?month=${month}`),
    enabled: !!month,
  })
}

/** This computer as the server knows it, or null in a plain browser (and in desktop builds before M13). */
export function useDesktopInstall(): DesktopInstall | null {
  const desktop = useDesktop()
  const install = useQuery({
    queryKey: ['desktop-install'],
    queryFn: () => desktop!.install!(),
    enabled: !!desktop?.install,
    staleTime: Number.POSITIVE_INFINITY,
  })
  return install.data ?? null
}

/** `skip: false` undoes the mark; any accountant may set or take it, from any computer. */
export function useSkipInvoice(month: string) {
  const install = useDesktopInstall()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ contractId, skip }: { contractId: string; skip: boolean }): Promise<void> => {
      const path = `${flagPath(month, contractId)}/skip`
      if (skip) await apiFetch<DidoxInvoiceFlags>(path, { method: 'PUT', body: { createdByInstall: install?.label ?? BROWSER } })
      else await apiFetch<void>(path, { method: 'DELETE' })
    },
    onSuccess: () => client.invalidateQueries({ queryKey: didoxFlagsKey }),
  })
}

/** "Hal qilindi" — an accountant has looked at it, so the flag goes for everyone. The invoice itself is not touched. */
export function useResolveNeedsCheck(month: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (contractId: string) =>
      apiFetch<void>(`${flagPath(month, contractId)}/needs-check/resolve`, { method: 'POST' }),
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
