import type { ImportResult } from './api'

/** "2 ta firma qo'shildi, 1 ta yangilandi" — only the parts that happened. */
export function importSummary({ created, updated }: Pick<ImportResult, 'created' | 'updated'>): string {
  const parts = [created && `${created} ta firma qo'shildi`, updated && `${updated} ta firma yangilandi`].filter(Boolean)
  return parts.join(', ') || "Hech narsa o'zgarmadi"
}
