import { useQuery } from '@tanstack/react-query'
import { useDesktop } from '@/lib/desktop'

/** Key status per firm STIR from local E-IMZO; disabled outside the desktop app. */
export function useEriKeys(tins: string[]) {
  const desktop = useDesktop()
  return useQuery({
    queryKey: ['eri-keys', tins],
    queryFn: () => desktop!.eri.listKeys(tins),
    enabled: !!desktop && tins.length > 0,
    staleTime: 30_000,
  })
}
