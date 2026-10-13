import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { DidoxRun } from '@/lib/desktop'
import { useDesktop } from '@/lib/desktop'

export const didoxStatusKey = ['didox-status'] as const

/** A run that ends without a last event would otherwise leave the banner up; the poll closes that gap. */
const POLL_MS = 2000

/**
 * The run that is going right now, or null. Progress events say "something moved", the journal says what —
 * so an event only asks for a re-read. Nothing here blocks a page: the app stays editable during a run (spec §7).
 */
export function useDidoxStatus(): DidoxRun | null {
  const didox = useDesktop()?.didox
  const client = useQueryClient()

  const status = useQuery({
    queryKey: didoxStatusKey,
    queryFn: () => didox!.status(),
    enabled: !!didox?.status,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? POLL_MS : false),
  })

  useEffect(
    () => didox?.onProgress(() => void client.invalidateQueries({ queryKey: didoxStatusKey })),
    [didox, client],
  )

  const run = status.data ?? null
  return run?.status === 'running' ? run : null
}
