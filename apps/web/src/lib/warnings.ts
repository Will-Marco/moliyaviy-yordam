import { ApiError } from './api'

export interface Warning {
  code: string
  message: string
}

/** A 409 listing warnings the accountant may confirm with "Baribir saqlash" (FR-3.3, FR-5.5). */
export function warningsToConfirm(error: unknown): Warning[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const body = error.body as { code?: string; warnings?: Warning[] } | undefined
  return body?.code === 'CONFIRMATION_REQUIRED' && body.warnings ? body.warnings : null
}
