import { TriangleAlert } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DidoxNeedsCheck } from '@/lib/desktop'

/**
 * M8c §7, M13: what a Didox run left behind on one invoice row, as the server keeps it for every accountant. An
 * interrupted save can only be looked into from the computer whose robot made it, so another computer's flag says
 * whose it is.
 */
export function DidoxNeedsCheckBadge({ needsCheck, thisInstall }: { needsCheck: DidoxNeedsCheck; thisInstall: string | null }) {
  const elsewhere = needsCheck.createdByInstall && needsCheck.createdByInstall !== thisInstall ? needsCheck.createdByInstall : null
  return (
    <div className="grid gap-1">
      <Badge className="bg-amber-100 text-amber-900">E'tibor kerak (Didox)</Badge>
      <span className="flex items-start gap-1 text-xs text-amber-800">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {needsCheck.message}
      </span>
      {elsewhere && <span className="text-muted-foreground text-xs">{`${elsewhere} dagi buxgalter tekshirishi kerak`}</span>}
      {needsCheck.didoxId && (
        <span className="flex items-center gap-1">
          <span className="font-mono text-xs break-all">{needsCheck.didoxId}</span>
          <CopyButton value={needsCheck.didoxId} label={`Didox hujjat ID ${needsCheck.didoxId}`} />
        </span>
      )}
    </div>
  )
}

export function DidoxSkippedBadge() {
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      O'tkazib yuboriladi (Didox)
    </Badge>
  )
}

interface ActionProps {
  /** For the screen-reader name of each button, as every other action on this page does. */
  contractNumber: string
  disabled: boolean
  onMark: () => void
  onResolve: () => void
  onSkip: (skip: boolean) => void
}

/** "Belgilash" opens the usual mark dialog with the Didox ID already in it; the other two only touch the flags. */
export function DidoxNeedsCheckActions({ contractNumber, disabled, onMark, onResolve, onSkip }: ActionProps) {
  return (
    <div className="grid gap-1">
      <Button
        variant="outline"
        size="sm"
        aria-label={`Qoralama deb belgilash: № ${contractNumber}`}
        onClick={onMark}
      >
        Belgilash
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={`Hal qilindi: № ${contractNumber}`}
        onClick={onResolve}
      >
        Hal qilindi
      </Button>
      <SkipButton contractNumber={contractNumber} disabled={disabled} onSkip={() => onSkip(true)} />
    </div>
  )
}

export function SkipButton({
  contractNumber,
  disabled,
  onSkip,
}: {
  contractNumber: string
  disabled: boolean
  onSkip: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      aria-label={`O'tkazib yuborish: № ${contractNumber}`}
      onClick={onSkip}
    >
      O'tkazib yuborish
    </Button>
  )
}

export function UnskipButton({
  contractNumber,
  disabled,
  onUnskip,
}: {
  contractNumber: string
  disabled: boolean
  onUnskip: () => void
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={`O'tkazib yuborishni bekor qilish: № ${contractNumber}`}
      onClick={onUnskip}
    >
      Bekor qilish
    </Button>
  )
}
