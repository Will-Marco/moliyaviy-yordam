import { Badge } from '@/components/ui/badge'
import type { EriKey } from '@/lib/desktop'
import { formatDate } from '@/lib/format'

/** One firm's ERI key: valid until a date, expired, or absent from E-IMZO. */
export function EriKeyCell({ eriKey }: { eriKey: EriKey | undefined }) {
  if (!eriKey) return <span className="text-muted-foreground">—</span>
  if (eriKey.status === 'missing') return <span className="text-muted-foreground text-sm">Kalit yo'q</span>
  if (eriKey.status === 'expired') {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
        Muddati o'tgan
      </Badge>
    )
  }
  return (
    <span className="text-sm tabular-nums">
      {eriKey.validTo ? `${formatDate(eriKey.validTo.slice(0, 10))} gacha` : 'Kalit bor'}
    </span>
  )
}
