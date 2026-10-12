import { ApiError } from './api'
import { createQueryClient } from './queryClient'

describe('createQueryClient', () => {
  it('reports 401 from queries and mutations, and nothing else', async () => {
    const onUnauthorized = vi.fn()
    const client = createQueryClient({ onUnauthorized })

    await client
      .fetchQuery({ queryKey: ['a'], queryFn: () => Promise.reject(new ApiError(401, 'x')), retry: false })
      .catch(() => {})
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new ApiError(401, 'x')) })
      .execute(undefined)
      .catch(() => {})
    await client
      .fetchQuery({ queryKey: ['b'], queryFn: () => Promise.reject(new ApiError(500, 'x')), retry: false })
      .catch(() => {})

    expect(onUnauthorized).toHaveBeenCalledTimes(2)
  })

  it('retries only failures that may pass on a second try (network, 5xx), never a 4xx answer', () => {
    const retry = createQueryClient({ onUnauthorized: () => {} }).getDefaultOptions().queries?.retry
    const retries = (error: unknown, count = 0) => typeof retry === 'function' && retry(count, error as Error)
    for (const status of [400, 401, 403, 404, 409, 422]) expect(retries(new ApiError(status, 'x'))).toBe(false)
    expect(retries(new ApiError(500, 'x'))).toBe(true)
    expect(retries(new ApiError(0, 'x'))).toBe(true) // network failure
    expect(retries(new ApiError(503, 'x'), 2)).toBe(false) // at most two retries
  })
})
