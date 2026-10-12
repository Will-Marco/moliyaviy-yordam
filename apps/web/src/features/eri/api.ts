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

export function useSetEriPassword() {
  const desktop = useDesktop()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ tin, password }: { tin: string; password: string }) => desktop!.eri.setPassword(tin, password),
    onSuccess: () => client.invalidateQueries({ queryKey: eriKeysKey }),
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
