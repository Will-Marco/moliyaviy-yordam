import { mockApi } from '@/test/utils'
import { ApiError, apiFetch } from './api'

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => expect.unreachable('expected the request to fail'),
    (error: ApiError) => error,
  )

describe('apiFetch', () => {
  it('sends JSON and returns the parsed body', async () => {
    const { calls } = mockApi({ 'POST /api/things': () => ({ status: 201, body: { id: '1' } }) })
    await expect(apiFetch('/things', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ id: '1' })
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/things', body: { a: 1 } })
  })

  it('returns undefined for 204', async () => {
    mockApi({ 'POST /api/auth/logout': () => ({ status: 204 }) })
    await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('throws ApiError with status, message and field errors', async () => {
    mockApi({
      'POST /api/companies': () => ({
        status: 400,
        body: { message: "Ma'lumotlar noto'g'ri", errors: { tin: ["STIR 9 ta raqamdan iborat bo'lishi kerak"] } },
      }),
    })
    const error = await rejection(apiFetch('/companies', { method: 'POST', body: {} }))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.message).toBe("Ma'lumotlar noto'g'ri")
    expect(error.fieldErrors).toEqual({ tin: "STIR 9 ta raqamdan iborat bo'lishi kerak" })
  })

  it('falls back to a generic message when the server sends none', async () => {
    mockApi({ 'GET /api/companies': () => ({ status: 500 }) })
    const error = await rejection(apiFetch('/companies'))
    expect(error.message).toBe("Server bilan bog'lanishda xato. Qayta urinib ko'ring.")
  })

  it('turns network failures into an ApiError with the Uzbek message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await rejection(apiFetch('/companies'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toBe("Server bilan bog'lanishda xato. Qayta urinib ko'ring.")
  })
})
