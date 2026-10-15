import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDesktop } from '@/lib/desktop'

const eriKeysKey = ['eri-keys'] as const

/** Key and saved-password status per firm STIR from local E-IMZO; disabled outside the desktop app. */
export function useEriKeys(tins: string[]) {
  const desktop = useDesktop()
  return useQuery({
    queryKey: [...eriKeysKey, tins],
    queryFn: () => desktop!.eri.listKeys(tins),
    enabled: !!desktop && tins.length > 0,
    staleTime: 30_000,
  })
}

/**
 * Opens the desktop app's own password window (M13, CONSTITUTION §13): the page that comes from the server never
 * sees the ERI password. Resolves when that window is closed; the status is re-read either way.
 */
export function useOpenEriPasswordWindow() {
  const desktop = useDesktop()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (tin: string) => desktop!.eri.openPasswordWindow(tin),
    onSettled: () => client.invalidateQueries({ queryKey: eriKeysKey }),
  })
}

export function useRemoveEriPassword() {
  const desktop = useDesktop()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (tin: string) => desktop!.eri.removePassword(tin),
    onSuccess: () => client.invalidateQueries({ queryKey: eriKeysKey }),
  })
}

/** "Kirishni tekshirish": logs in to Didox as the firm and out again. The password may end up `rejected`, so refresh. */
export function useCheckDidoxLogin() {
  const desktop = useDesktop()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (tin: string) => desktop!.didox!.checkLogin(tin),
    onSettled: () => client.invalidateQueries({ queryKey: eriKeysKey }),
  })
}
