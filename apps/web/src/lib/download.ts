import { ApiError } from './api'

/**
 * Fetches a file from the API and hands it to the browser as a download. A failed request (expired session,
 * server error) throws ApiError instead of saving the error body as a file, which a plain link would do.
 */
export async function downloadFile(path: string, init: RequestInit = {}, fallbackName = 'fayl.xlsx'): Promise<void> {
  const response = await fetch(`/api${path}`, { ...init, credentials: 'same-origin' })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: unknown }
    throw new ApiError(response.status, typeof body.message === 'string' ? body.message : "Faylni yuklab bo'lmadi")
  }
  const name = fileName(response.headers.get('Content-Disposition')) ?? fallbackName
  const url = URL.createObjectURL(await response.blob())
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** `filename*=UTF-8''…` (non-ASCII names) wins over the plain `filename="…"`. */
function fileName(disposition: string | null): string | null {
  if (!disposition) return null
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim())
    } catch {
      // fall through to the plain name
    }
  }
  return disposition.match(/filename="([^"]+)"/i)?.[1] ?? null
}
