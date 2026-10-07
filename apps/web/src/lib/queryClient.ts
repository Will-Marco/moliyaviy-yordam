import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isUnauthorized } from './api'

/** One place that reacts to an expired session, for every query and mutation. */
export function createQueryClient({ onUnauthorized }: { onUnauthorized: () => void }) {
  const onError = (error: unknown) => {
    if (isUnauthorized(error)) onUnauthorized()
  }
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { retry: (count, error) => !isUnauthorized(error) && count < 2, refetchOnWindowFocus: false },
    },
  })
}
