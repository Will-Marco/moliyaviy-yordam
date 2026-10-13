import { LoaderCircle } from 'lucide-react'
import { formatMonth } from '@/lib/format'
import { useDidoxStatus } from './useDidoxStatus'

/**
 * Spec §7 (Sir decision 2): while the app drives Didox, nothing in the app is blocked — the accountant is only
 * warned, because an edit that changes an amount mid-run comes back as a 409 and lands in "e'tibor kerak".
 */
export function DidoxRunBanner() {
  const run = useDidoxStatus()
  if (!run) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900"
    >
      <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
      {`Didox qoralamalari yaratilmoqda (${formatMonth(run.month)}) — hisobotni o'zgartiruvchi tahrirlardan saqlaning`}
    </div>
  )
}
