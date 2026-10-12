import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError, isUnauthorized } from './api'

/** One place that reacts to an expired session, for every query and mutation. */
export function createQueryClient({ onUnauthorized }: { onUnauthorized: () => void }) {
  const onError = (error: unknown) => {
    if (isUnauthorized(error)) onUnauthorized()
  }
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { retry: (count, error) => count < 2 && !isClientError(error), refetchOnWindowFocus: false },
    },
  })
}

/** A 4xx answer will not change on retry (bad input, no session, not found): show it at once. */
const isClientError = (error: unknown) => error instanceof ApiError && error.status >= 400 && error.status < 500
