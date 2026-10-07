import { LoaderCircle } from 'lucide-react'
import { Outlet } from 'react-router'
import { QueryErrorState } from '@/components/QueryErrorState'
import { useMe } from './api'

/** Gate for every page behind login. */
export function RequireAuth() {
  const me = useMe()
  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <LoaderCircle className="text-muted-foreground size-6 animate-spin" aria-label="Yuklanmoqda" />
      </div>
    )
  }
  if (me.error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <QueryErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    )
  }
  return <Outlet />
}
