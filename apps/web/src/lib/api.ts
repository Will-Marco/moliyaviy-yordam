const GENERIC_ERROR = "Server bilan bog'lanishda xato. Qayta urinib ko'ring."

export class ApiError extends Error {
  readonly status: number
  /** First message per field, as sent by the API's validation pipe. */
  readonly fieldErrors: Record<string, string>
  /** Raw error body, for responses that carry more than a message (e.g. warnings to confirm). */
  readonly body: unknown

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.body = body
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
}

/** Same-origin JSON client for `/api`; the session cookie travels automatically. */
export async function apiFetch<T>(path: string, { method = 'GET', body }: ApiOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // Network down / server restarting: fetch rejects with a browser-specific TypeError.
    throw new ApiError(0, GENERIC_ERROR)
  }

  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => undefined)
  if (response.ok) return data as T

  const payload = (data ?? {}) as { message?: unknown; errors?: Record<string, string[]> }
  const message = typeof payload.message === 'string' ? payload.message : GENERIC_ERROR
  const fieldErrors = Object.fromEntries(
    Object.entries(payload.errors ?? {}).map(([field, messages]) => [field, messages[0]]),
  )
  throw new ApiError(response.status, message, fieldErrors, data)
}

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401
