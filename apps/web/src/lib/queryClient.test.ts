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

  it('does not retry 401s', () => {
    const retry = createQueryClient({ onUnauthorized: () => {} }).getDefaultOptions().queries?.retry
    expect(typeof retry === 'function' && retry(0, new ApiError(401, 'x'))).toBe(false)
    expect(typeof retry === 'function' && retry(0, new ApiError(500, 'x'))).toBe(true)
  })
})
