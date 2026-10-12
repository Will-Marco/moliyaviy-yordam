import { Badge } from '@/components/ui/badge'
import type { EriPasswordStatus } from '@/lib/desktop'

const amber = 'border-amber-300 bg-amber-50 text-amber-900'

/** FR-8.2 states of the firm's saved ERI password. */
export function EriPasswordCell({ status }: { status: EriPasswordStatus | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  if (status === 'set') return <span className="text-sm">Parol bor</span>
  if (status === 'missing') return <span className="text-muted-foreground text-sm">Parol yo'q</span>
  return (
    <Badge variant="outline" className={amber}>
      {status === 'rejected' ? "E'tibor kerak: parol rad etilgan" : 'Kalit yangilangan'}
    </Badge>
  )
}
