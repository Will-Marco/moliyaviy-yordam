import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatInstantDateTime, formatMoney, formatMonth } from '@/lib/format'
import { useDidoxRun } from './didoxApi'
import { RUN_LABELS, STATE_CLASS, STATE_LABELS } from './didoxLabels'

interface Props {
  runId: string
  onOpenChange: (open: boolean) => void
}

/** What one finished run did, firm by firm: every invoice with its state and, when there is one, its reason. */
export function DidoxRunDetailDialog({ runId, onOpenChange }: Props) {
  const run = useDidoxRun(runId)
  const journal = run.data ?? null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Didox jarayoni</DialogTitle>
          <DialogDescription>
            {journal
              ? `${formatMonth(journal.month)} · ${formatInstantDateTime(journal.startedAt)} · ${RUN_LABELS[journal.status]}`
              : 'Tafsilotlar'}
          </DialogDescription>
        </DialogHeader>

        {run.error ? (
          <p className="text-destructive text-sm" role="alert">
            {`Jarayonni o'qib bo'lmadi: ${run.error instanceof Error ? run.error.message : String(run.error)}`}
          </p>
        ) : !run.isFetched ? (
          <p className="text-muted-foreground text-sm" aria-busy="true">
            Yuklanmoqda…
          </p>
        ) : !journal ? (
          <p className="text-muted-foreground text-sm">Bu jarayon yozuvi saqlanmagan</p>
        ) : (
          <div className="grid max-h-80 gap-3 overflow-y-auto" aria-label="Fakturalar holati">
            {journal.failure && <p className="text-destructive text-sm">{journal.failure.message}</p>}
            {journal.firms.map((firm) => (
              <div key={firm.tin} className="grid gap-1">
                <p className="text-sm font-medium">
                  {firm.name}
                  <span className="text-muted-foreground font-normal">{` (STIR ${firm.tin})`}</span>
                </p>
                {firm.message && <p className="text-muted-foreground text-xs">{firm.message}</p>}
                <ul className="grid gap-0.5">
                  {firm.invoices.map((invoice) => (
                    <li key={invoice.contractId} className="grid text-sm">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span>{`№ ${invoice.contractNumber}`}</span>
                        <span className="text-muted-foreground text-xs">{invoice.borrowerName}</span>
                        <span className="font-mono text-xs tabular-nums">{formatMoney(invoice.amount)}</span>
                        <span className={STATE_CLASS[invoice.state] ?? 'text-muted-foreground'}>
                          {STATE_LABELS[invoice.state]}
                        </span>
                      </span>
                      {invoice.message && <span className="text-muted-foreground text-xs">{invoice.message}</span>}
                      {invoice.didoxId && (
                        <span className="text-muted-foreground font-mono text-xs break-all">{`Didox ID ${invoice.didoxId}`}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
