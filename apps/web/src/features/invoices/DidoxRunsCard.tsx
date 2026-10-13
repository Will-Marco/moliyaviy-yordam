import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DidoxRunSummary } from '@/lib/desktop'
import { useDesktop } from '@/lib/desktop'
import { formatInstantDateTime } from '@/lib/format'
import { useDidoxRuns } from './didoxApi'
import { RUN_LABELS } from './didoxLabels'
import { DidoxRunDetailDialog } from './DidoxRunDetailDialog'

/** Spec §7: the last five runs of the selected month, so the accountant can go back to what one of them did. */
const RUN_LIMIT = 5

/** `marked` is always named, even as "0 yaratildi" — a run that produced nothing should say so, not fall silent. */
function countsLine(counts: DidoxRunSummary['counts']): string {
  return [
    `${counts.marked} yaratildi`,
    ...(counts.needsCheck ? [`${counts.needsCheck} e'tibor kerak`] : []),
    ...(counts.skipped ? [`${counts.skipped} o'tkazib yuborildi`] : []),
    ...(counts.error ? [`${counts.error} xato`] : []),
    ...(counts.pending ? [`${counts.pending} navbatda`] : []),
  ].join(' · ')
}

/** Desktop only: a plain browser (or a build older than M8c) has no journal to show. */
export function DidoxRunsCard({ month }: { month: string }) {
  const didox = useDesktop()?.didox
  const runs = useDidoxRuns(month, RUN_LIMIT)
  const [openRunId, setOpenRunId] = useState<string | null>(null)

  if (!didox?.listRuns) return null

  const openDiagnostics = () =>
    didox.openDiagnostics().catch(() => toast.error("Diagnostika papkasini ochib bo'lmadi"))

  return (
    <Card size="sm" aria-labelledby="didox-runs-title">
      <CardHeader className="border-b">
        <CardTitle id="didox-runs-title">Didox jarayonlari</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={openDiagnostics}>
            <FolderOpen aria-hidden="true" />
            Diagnostika papkasi
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {runs.error ? (
          <p className="text-destructive text-sm" role="alert">
            {`Jarayonlar ro'yxatini o'qib bo'lmadi: ${runs.error instanceof Error ? runs.error.message : String(runs.error)}`}
          </p>
        ) : !runs.data ? (
          <p className="text-muted-foreground text-sm" aria-busy="true">
            Yuklanmoqda…
          </p>
        ) : runs.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">Bu oyda hali jarayon bo'lmagan</p>
        ) : (
          <ul className="grid gap-1" aria-label="Didox jarayonlari">
            {runs.data.map((run) => (
              <li key={run.runId}>
                <Button
                  variant="ghost"
                  className="h-auto w-full justify-start gap-x-3 py-1.5 text-left whitespace-normal"
                  aria-label={`Jarayon tafsiloti: ${formatInstantDateTime(run.startedAt)}`}
                  onClick={() => setOpenRunId(run.runId)}
                >
                  <span className="text-xs tabular-nums">{formatInstantDateTime(run.startedAt)}</span>
                  <span className="text-xs font-medium">{RUN_LABELS[run.status]}</span>
                  <span className="text-muted-foreground text-xs font-normal">{countsLine(run.counts)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {openRunId && <DidoxRunDetailDialog runId={openRunId} onOpenChange={() => setOpenRunId(null)} />}
    </Card>
  )
}
