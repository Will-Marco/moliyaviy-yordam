import type { DidoxInvoiceState, DidoxRun } from '@/lib/desktop'

/** Uzbek names for the journal states, shared by the live run dialog and the run history (spec §7). */
export const STATE_LABELS: Record<DidoxInvoiceState, string> = {
  pending: 'navbatda',
  saving: 'saqlanmoqda',
  id_found: 'ID topildi',
  marked: 'yaratildi',
  needs_check: "e'tibor kerak",
  skipped: "o'tkazib yuborildi",
  error: 'xato',
}

export const RUN_LABELS: Record<DidoxRun['status'], string> = {
  running: 'Davom etmoqda',
  done: 'Yakunlandi',
  cancelled: 'Bekor qilindi',
  failed: 'Xatolik bilan tugadi',
}

export const STATE_CLASS: Partial<Record<DidoxInvoiceState, string>> = {
  marked: 'text-emerald-700',
  needs_check: 'text-amber-800',
  error: 'text-destructive',
}
