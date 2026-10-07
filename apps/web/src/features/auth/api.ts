import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface Me {
  username: string
}

export const meQueryKey = ['auth', 'me'] as const

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: () => apiFetch<Me>('/auth/me'), staleTime: Infinity })
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      apiFetch<Me>('/auth/login', { method: 'POST', body }),
    onSuccess: (me) => client.setQueryData(meQueryKey, me),
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => client.clear(),
  })
}
